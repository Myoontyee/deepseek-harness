/** Same-Session message revision using the existing append-only surface replacement protocol. */
import type { SessionObservation } from '@deepseek-ai/dsh-session-query'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createDeveloperMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionEditMessageRequest } from './types.ts'

/**
 * Withdraw the latest message's model-visible tail and enqueue its replacement atomically with respect to turns.
 * @param agent - Explicitly resolved Session owner.
 * @param request - Expected last-message sequence, edited text, and retry identity.
 * @param read - Owned snapshot of the current durable event prefix.
 * @param flush - Persist the replacement and inbox records before acknowledgement.
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
    const position = observed.events.findLast(event => event.type === 'step/start')
    if (position?.type !== 'step/start') {
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
      source: { ...original.data.source, rpcId: request.requestId },
    })
    session.append('developer/message', {
      turn: position.data.turn, step: position.data.step,
      message: createDeveloperMessage({ content: [], source: {
        kind: 'message-edit', startSeq: original.seq, endSeq: session.seq - 1, requestId: request.requestId,
      } }),
    }, { surfaceOp: { op: 'replace', startSeq: original.seq, endSeq: end }, sourceEventSeqs: nodes.slice(nodes.indexOf(original.seq)) })
    agent.followup(replacement)
    await flush()
  })
}
