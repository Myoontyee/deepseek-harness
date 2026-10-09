/** Same-Session message revision using the existing append-only surface replacement protocol. */
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionObservation } from '@deepseek-ai/dsh-session-query'
import type { Context } from '@deepseek-ai/cordis'
import type { MessageSourceMap } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createDeveloperMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionEditMessageRequest } from './types.ts'

/**
 * Queue a durable revision intent without writing step-owned events outside a live step.
 * @param agent - Explicitly resolved Session owner.
 * @param request - Expected last-message sequence, edited text, and retry identity.
 * @param read - Owned snapshot of the current durable event prefix.
 * @param flush - Persist the queued edit intent before acknowledgement.
 * @returns Completion after the revised prompt has been queued and flushed.
 */
export async function editLatestMessage(
  agent: Pick<Agent, 'session' | 'status' | 'runMaintenance' | 'followup'>
    & { readonly inbox: Pick<Agent['inbox'], 'nextTurn' | 'nextStep'> },
  request: SessionEditMessageRequest,
  read: () => Promise<SessionObservation>,
  flush: () => Promise<unknown>,
): Promise<void> {
  if (!Number.isSafeInteger(request.seq) || request.seq < 0) throw new RemoteError('gateway/bad-request', 'Invalid message sequence', {})
  if (agent.status !== 'idle' || agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0) {
    throw new RemoteError('gateway/bad-request', 'MESSAGE_EDIT_BUSY', {})
  }
  await agent.runMaintenance(async () => {
    const session = agent.session
    using observed = await read()
    if (observed.events.length !== session.seq || agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0) {
      throw new RemoteError('gateway/bad-request', 'MESSAGE_EDIT_BUSY', {})
    }
    const original = observed.events.findLast(event => event.type === 'user/message'
      && event.surfaceOp === 'append' && event.data.source.kind === 'user')
    if (original?.type !== 'user/message' || original.seq !== request.seq) {
      throw new RemoteError('gateway/bad-request', 'MESSAGE_EDIT_NOT_LATEST', {})
    }
    const nodes = session.surface.nodes
    const end = nodes.at(-1)
    if (end === undefined || !nodes.includes(original.seq)) {
      throw new RemoteError('gateway/bad-request', 'MESSAGE_EDIT_COMPACTED', {})
    }
    const attachments = original.data.content.filter(block => block.type !== 'text')
    if (request.text.trim() === '' && attachments.length === 0) {
      throw new RemoteError('gateway/bad-request', 'MESSAGE_EDIT_EMPTY', {})
    }
    const replacement = createUserMessage({
      content: [{ type: 'text' as const, text: request.text }, ...attachments],
      source: { ...original.data.source, rpcId: request.requestId, edit: {
        startSeq: original.seq, endSeq: session.seq - 1, surfaceEndSeq: end,
      } },
    })
    agent.followup(replacement)
    await flush()
  })
}

/**
 * Apply queued message revisions only after the loop opens their owning step.
 * The inbox persists the intent; the empty replacement remains a normal logged surface operation.
 * @param ctx - Context owning the Agent lifecycle listeners.
 */
export function installMessageRevisions(ctx: Context): void {
  const pending = new WeakMap<Agent, { turn: number; step: number; source: MessageSourceMap['user-rpc'] }>()
  ctx.on('agent/pre-step', async ({ agent, turn, step }, next) => {
    pending.delete(agent)
    const decision = await next()
    if (decision.kind === 'enter') {
      for (const message of decision.messages) {
        const source = message.source
        if (source.kind !== 'user' || !('edit' in source) || source.edit === undefined) continue
        if (pending.has(agent)) throw new Error('MESSAGE_EDIT_MULTIPLE')
        pending.set(agent, { turn, step, source })
      }
    }
    return decision
  })
  ctx.on('agent/request', async ({ agent, turn, step, signal }, next) => {
    const config = await next()
    signal.throwIfAborted()
    const intent = pending.get(agent)
    pending.delete(agent)
    if (intent === undefined || intent.turn !== turn || intent.step !== step) return config
    const edit = intent.source.edit
    if (edit === undefined) return config
    // Queued input is restored from disk. Refuse stale or malformed ranges before any mutation.
    if (![edit.startSeq, edit.endSeq, edit.surfaceEndSeq].every(seq => Number.isSafeInteger(seq) && seq >= 0)
      || edit.startSeq > edit.surfaceEndSeq || edit.surfaceEndSeq > edit.endSeq || edit.endSeq >= agent.session.seq) {
      throw new Error('MESSAGE_EDIT_INVALID_RANGE')
    }
    const nodes = agent.session.surface.nodes
    const startSeq = SessionSeq(edit.startSeq)
    const endSeq = SessionSeq(edit.surfaceEndSeq)
    const start = nodes.indexOf(startSeq)
    const end = nodes.indexOf(endSeq)
    if (start < 0 || end < start) throw new Error('MESSAGE_EDIT_COMPACTED')
    agent.session.append('developer/message', {
      turn, step,
      message: createDeveloperMessage({ content: [], source: {
        kind: 'message-edit', startSeq: edit.startSeq, endSeq: edit.endSeq, requestId: intent.source.rpcId,
      } }),
    }, { surfaceOp: { op: 'replace', startSeq, endSeq }, sourceEventSeqs: nodes.slice(start, end + 1) })
    return config
  })
  ctx.on('agent/disposed', ({ agent }) => { pending.delete(agent) })
  ctx.on('agent/status', ({ agent, status }) => { if (status === 'idle') pending.delete(agent) })
}
