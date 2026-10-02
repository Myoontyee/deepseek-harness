/** Ordinary Session delivery through real loop inboxes and recorded model requests. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import SessionQuery from '@deepseek-ai/dsh-session-query'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { SessionRelay } from '../src/session-relay.ts'
import * as sessionTools from '../src/session-tools.ts'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionRelayRequest } from '../src/types.ts'

class RelayTestQuery extends SessionQuery {
  override searchSessions(): Promise<never> { return Promise.reject(new Error('Search is not used by relay delivery')) }
  override searchEvents(): Promise<never> { return Promise.reject(new Error('Search is not used by relay delivery')) }
}

async function setup(responses = ['B finished', 'A received feedback']) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  const adapter = new MockAdapter(responses.map(textResponse))
  ctx.llm.registerAdapter(['mock'], adapter)
  await ctx.plugin(RelayTestQuery, {})
  const archived: ReturnType<typeof SessionId>[] = []
  ctx.provide('workspaceRegistry', { archivedSessionIds: archived } as never)
  const harness = await mountAgentLoopTestHarness(ctx)
  const source = await harness.create(SessionId('source'), { provider: 'mock', model: 'mock' }, { cwd: '/work' })
  const target = await harness.create(SessionId('target'), { provider: 'mock', model: 'mock' }, { cwd: '/work' })
  const relay = new SessionRelay(ctx, async (id) => {
    const agent = ctx.agents.get(id)
    return agent ? { agent } : { error: new RemoteError('session/not-found', 'Unknown session', { sessionId: id }) }
  }, { maxMessageChars: 16000, maxFeedbackChars: 32000 })
  const request = { requestId: 'request-1', sourceSessionId: source.id, targetSessionId: target.id, message: 'Review the change', replyRequested: true }
  return { ctx, adapter, source, target, relay, request, archived }
}

describe('ordinary Session relay', () => {
  it('lets model tools discover another project and send from their exact caller', async () => {
    const h = await setup()
    try {
      h.ctx.provide('sessionController', {
        list: async () => ({ items: [
          { sessionId: h.source.id, cwd: '/work', running: false },
          { sessionId: h.target.id, cwd: '/other-project', running: false, projections: { values: { title: 'Review' } } },
          { sessionId: SessionId('child'), origin: 'subagent', cwd: '/work', running: false },
        ] }),
        sendMessageFromAgent: (sender: Agent, request: Omit<SessionRelayRequest, 'sourceSessionId'>, signal: AbortSignal) =>
          h.relay.send({ ...request, sourceSessionId: sender.id }, signal, sender),
      } as never)
      await h.ctx.plugin(sessionTools, { maxResults: 1 })
      const discovery = await h.ctx.tools.execute({ name: 'list_sessions', arguments: { query: 'other-project' }, agent: h.source, callId: ToolCallId('discover'), signal: new AbortController().signal })
      expect(discovery.content).toMatchInlineSnapshot(`
        [
          {
            "text": "{"items":[{"sessionId":"target","title":"Review","cwd":"/other-project","running":false}],"hasMore":false}",
            "type": "text",
          },
        ]
      `)
      const sent = await h.ctx.tools.execute({ name: 'send_session_message', arguments: { session_id: h.target.id, message: 'Review the change', reply_requested: true }, agent: h.source, callId: ToolCallId('send'), signal: new AbortController().signal })
      expect(JSON.stringify(sent.content)).toContain('accepted')
      await h.target.whenIdle()
      await h.source.whenIdle()
      expect(h.adapter.requests).toHaveLength(2)
      using observation = await h.ctx.sessionQuery.observeSession(h.target.id, { projectionMode: 'none' })
      expect(observation.events.filter(event => event.type === 'user/message').map(event => event.data.content)).toMatchInlineSnapshot(`
        [
          [
            {
              "text": "Message from session source:
        Review the change

        Your final response will be returned to the sending session once. Do not send a separate reply for this request.",
              "type": "text",
            },
          ],
        ]
      `)
    } finally { await h.ctx.fiber.dispose() }
  })

  it('queues behind active maintenance and releases only one turn', async () => {
    const h = await setup()
    const gate = Promise.withResolvers<undefined>()
    const maintenance = h.target.runMaintenance(() => gate.promise)
    try {
      await h.relay.send(h.request, new AbortController().signal)
      expect(h.adapter.requests).toHaveLength(0)
      expect(h.target.inbox.nextTurn).toHaveLength(1)
      gate.resolve(undefined)
      await maintenance
      await h.target.whenIdle()
      await h.source.whenIdle()
      expect(h.adapter.requests).toHaveLength(2)
    } finally { gate.resolve(undefined); await maintenance; await h.ctx.fiber.dispose() }
  })

  it('rejects a mismatched caller even while the same request is in flight', async () => {
    const h = await setup()
    try {
      const first = h.relay.send(h.request, new AbortController().signal, h.source)
      await expect(h.relay.send(h.request, new AbortController().signal, h.target)).rejects.toThrow(/calling session/)
      await first
      await h.target.whenIdle()
      await h.source.whenIdle()
    } finally { await h.ctx.fiber.dispose() }
  })

  it('does not fabricate feedback for a failed model turn', async () => {
    const h = await setup([])
    try {
      await h.relay.send(h.request, new AbortController().signal)
      await h.target.whenIdle()
      expect(h.adapter.requests).toHaveLength(1)
      using observation = await h.ctx.sessionQuery.observeSession(h.source.id, { projectionMode: 'none' })
      expect(observation.events.some(event => event.type === 'user/message')).toBe(false)
    } finally { await h.ctx.fiber.dispose() }
  })

  it('rejects messages after its owning context is disposed', async () => {
    const h = await setup([])
    await h.ctx.fiber.dispose()
    await expect(h.relay.send(h.request, new AbortController().signal)).rejects.toThrow(/cancelled/)
  })

  it('limits the complete returned feedback text', async () => {
    const h = await setup(['x'.repeat(33000), 'Received'])
    try {
      await h.relay.send(h.request, new AbortController().signal)
      await h.target.whenIdle()
      await h.source.whenIdle()
      using observation = await h.ctx.sessionQuery.observeSession(h.source.id, { projectionMode: 'none' })
      const message = observation.events.find(event => event.type === 'user/message')
      if (message?.type !== 'user/message') throw new Error('Missing feedback')
      const text = message.data.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
      expect(text.length).toBeLessThanOrEqual(32000)
      expect(text).toContain('[Truncated; open the source session.]')
    } finally { await h.ctx.fiber.dispose() }
  })

  it('delivers once, returns a final response to the source, and does not bounce feedback back', async () => {
    const h = await setup()
    try {
      const [first, duplicate] = await Promise.all([
        h.relay.send(h.request, new AbortController().signal),
        h.relay.send(h.request, new AbortController().signal),
      ])
      expect(first).toEqual(duplicate)
      await h.target.whenIdle()
      await h.source.whenIdle()
      expect(h.adapter.requests).toHaveLength(2)
      expect(JSON.stringify(h.adapter.requests[0]?.messages)).toContain('Review the change')
      expect(JSON.stringify(h.adapter.requests[1]?.messages)).toContain('B finished')
      using source = await h.ctx.sessionQuery.observeSession(h.source.id, { projectionMode: 'none' })
      const received = source.events.filter(event => event.type === 'user/message')
      expect(received).toHaveLength(1)
      expect(received[0]?.data).toMatchObject({ source: { senderSessionId: h.target.id, feedback: true, replyRequested: false } })
      await h.relay.send(h.request, new AbortController().signal)
      await h.target.whenIdle()
      expect(h.adapter.requests).toHaveLength(2)
    } finally { await h.ctx.fiber.dispose() }
  })

  it('does not wake the source when feedback was disabled', async () => {
    const h = await setup(['Only B answers'])
    try {
      await h.relay.send({ ...h.request, replyRequested: false }, new AbortController().signal)
      await h.target.whenIdle()
      expect(h.adapter.requests).toHaveLength(1)
      expect(h.source.inbox.nextTurn).toHaveLength(0)
    } finally { await h.ctx.fiber.dispose() }
  })

  it('rejects empty, self-addressed, archived, unknown, and cancelled delivery before model work', async () => {
    const h = await setup([])
    try {
      const signal = new AbortController().signal
      await expect(h.relay.send({ ...h.request, message: '  ' }, signal)).rejects.toThrow()
      await expect(h.relay.send({ ...h.request, targetSessionId: h.source.id }, signal)).rejects.toThrow()
      await expect(h.relay.send({ ...h.request, targetSessionId: SessionId('missing') }, signal)).rejects.toThrow()
      h.archived.push(h.target.id)
      await expect(h.relay.send(h.request, signal)).rejects.toThrow(/Restore/)
      h.archived.pop()
      await expect(h.relay.send(h.request, AbortSignal.abort())).rejects.toThrow()
      expect(h.adapter.requests).toHaveLength(0)
      expect(h.target.inbox.nextTurn).toHaveLength(0)
    } finally { await h.ctx.fiber.dispose() }
  })
})
