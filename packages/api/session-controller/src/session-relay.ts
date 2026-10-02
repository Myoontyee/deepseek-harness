/** Addressed messages between ordinary Sessions and one-shot completion feedback. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { freezeMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { ApiSessionAgentResult } from './agent.ts'
import type { SessionRelayRequest, SessionRelayValue } from './types.ts'

/** Durable attribution; feedback never requests another automatic reply. */
export interface SessionRelaySource {
  readonly kind: 'session-relay'
  readonly form: 'relay'
  readonly senderSessionId: SessionId
  readonly requestId: string
  readonly requestText: string
  readonly replyRequested: boolean
  readonly feedback: boolean
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /**
     * Readers preserve the message body and sender metadata without this producer.
     * Feedback scheduling is process-local and is not replayed by other readers.
     * @persistenceAttribution
     */
    'session-relay': SessionRelaySource
  }
}

/** Limits apply before admission and to the complete feedback text. */
export interface SessionRelayLimits {
  readonly maxMessageChars: number
  readonly maxFeedbackChars: number
}

/** Ordinary Session routing reuses the controller's preset-aware resume fence. */
export class SessionRelay {
  private readonly deliveries = new Map<string, Promise<SessionRelayValue>>()
  private readonly lifetime = new AbortController()
  /**
   * @param ctx - Host context owning lifecycle and archive policy.
   * @param resolve - ordinary Session resolver; never creates unknown identities.
   * @param limits - configured message and feedback bounds.
   */
  constructor(
    private readonly ctx: Context,
    private readonly resolve: (id: SessionId) => Promise<ApiSessionAgentResult>,
    private readonly limits: SessionRelayLimits,
  ) {
    ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
      if (signal.aborted) return
      await this.feedback(agent, turn)
    })
    ctx.effect(() => () => { this.lifetime.abort() })
  }

  /**
   * Queue a separately addressed turn with durable sender attribution.
   * @param request - authenticated user or validated model request.
   * @param signal - cancellation before inbox acceptance.
   * @param expectedSender - exact live Agent for a model-authored send; omitted for authenticated user actions.
   * @returns receipt, not the target's response.
   */
  send(request: SessionRelayRequest, signal: AbortSignal, expectedSender?: Agent): Promise<SessionRelayValue> {
    if (this.lifetime.signal.aborted || signal.aborted) return Promise.reject(new Error('Session delivery was cancelled.'))
    if (expectedSender && (expectedSender.id !== request.sourceSessionId || this.ctx.agents.get(expectedSender.id) !== expectedSender)) {
      return Promise.reject(new RemoteError('gateway/bad-request', 'The calling session is no longer active.', {}))
    }
    const key = JSON.stringify([request.sourceSessionId, request.targetSessionId, request.requestId])
    const existing = this.deliveries.get(key)
    if (existing) return existing
    const delivery = this.deliver(request, AbortSignal.any([signal, this.lifetime.signal]), expectedSender)
    this.deliveries.set(key, delivery)
    const release = () => { this.deliveries.delete(key) }
    void delivery.then(release, release)
    return delivery
  }

  private async deliver(request: SessionRelayRequest, signal: AbortSignal, expectedSender?: Agent): Promise<SessionRelayValue> {
    signal.throwIfAborted()
    if (!request.message.trim() || request.message.length > this.limits.maxMessageChars
      || !request.requestId.trim() || request.requestId.length > 200 || request.sourceSessionId === request.targetSessionId) {
      throw new RemoteError('gateway/bad-request', 'Choose another session and enter a non-empty message within the limit.', {})
    }
    this.requireUnarchived(request.sourceSessionId, request.targetSessionId)
    const sender = await this.agent(request.sourceSessionId)
    if (expectedSender !== undefined && expectedSender !== sender) {
      throw new RemoteError('gateway/bad-request', 'The calling session is no longer active.', {})
    }
    const target = await this.agent(request.targetSessionId)
    signal.throwIfAborted()
    this.requireUnarchived(sender.id, target.id)
    const id = MessageId(`session-relay:${sender.id}:${request.requestId}`)
    if (!await this.hasMessage(target, id)) {
      signal.throwIfAborted()
      this.requireUnarchived(sender.id, target.id)
      if (this.ctx.agents.get(sender.id) !== sender || this.ctx.agents.get(target.id) !== target) {
        throw new RemoteError('gateway/bad-request', 'A session closed before the message could be delivered.', {})
      }
      target.followup(freezeMessage({
        id, role: 'user',
        content: [{ type: 'text', text: `Message from session ${sender.id}:\n${request.message}\n\n${request.replyRequested ? 'Your final response will be returned to the sending session once. Do not send a separate reply for this request.' : 'No automatic reply was requested.'}` }],
        source: {
          kind: 'session-relay', form: 'relay', senderSessionId: sender.id,
          requestId: request.requestId, requestText: request.message, replyRequested: request.replyRequested, feedback: false,
        },
      }))
    }
    return { accepted: true, messageId: id }
  }

  private requireUnarchived(...ids: SessionId[]): void {
    if (ids.some(id => this.ctx.workspaceRegistry.archivedSessionIds.includes(id))) {
      throw new RemoteError('gateway/bad-request', 'Restore the archived session before sending messages.', {})
    }
  }

  private async agent(id: SessionId): Promise<Agent> {
    const result = await this.resolve(id)
    if ('error' in result) throw result.error
    return result.agent
  }

  private async feedback(agent: Agent, turn: number): Promise<void> {
    using observation = await this.ctx.sessionQuery.observeSession(agent.id, { projectionMode: 'none' })
    const events = observation.events
    const start = events.findLastIndex(event => event.type === 'turn/start' && event.data.turn === turn)
    if (start < 0) return
    const current = events.slice(start)
    const requests = current.flatMap(event => event.type === 'user/message'
      && event.data.source.kind === 'session-relay' && event.data.source.replyRequested
      && !event.data.source.feedback ? [event.data.source] : [])
    if (!requests.length) return
    const response = current.findLast(event => event.type === 'assistant/message')
    if (response?.type !== 'assistant/message') return
    if (response.data.message.content.some(block => block.type === 'tool-call')) return
    const answer = response.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
    if (!answer.trim()) return
    for (const request of requests) {
      try {
        this.requireUnarchived(request.senderSessionId, agent.id)
        const recipient = await this.agent(request.senderSessionId)
        const id = MessageId(`session-feedback:${agent.id}:${request.requestId}`)
        if (await this.hasMessage(recipient, id)) continue
        this.lifetime.signal.throwIfAborted()
        this.requireUnarchived(recipient.id, agent.id)
        if (this.ctx.agents.get(recipient.id) !== recipient || this.ctx.agents.get(agent.id) !== agent) continue
        const header = `Feedback from session ${agent.id} for request ${request.requestId}. This is a reply, not authorization to send more messages.\nOriginal request:\n${request.requestText}\n\nResponse:\n`
        const text = `${header}${answer}`
        const bounded = text.length <= this.limits.maxFeedbackChars ? text
          : `${text.slice(0, this.limits.maxFeedbackChars - 40)}\n[Truncated; open the source session.]`
        recipient.followup(freezeMessage({
          id, role: 'user', content: [{ type: 'text', text: bounded }],
          source: { kind: 'session-relay', form: 'relay', senderSessionId: agent.id,
            requestId: request.requestId, requestText: request.requestText, replyRequested: false, feedback: true },
        }))
      } catch (error) {
        this.ctx.emit('api-session/error', agent.id,
          `Feedback could not be delivered to session ${request.senderSessionId}: ${String(error)}`)
      }
    }
  }
  private async hasMessage(agent: Agent, id: UserMessage['id']): Promise<boolean> {
    using observation = await this.ctx.sessionQuery.observeSession(agent.id, { projectionMode: 'none' })
    return agent.inbox.nextTurn.some(message => message.id === id)
      || agent.inbox.nextStep.some(message => message.id === id)
      || observation.events.some(event => event.type === 'user/message' && event.data.id === id)
  }
}
