/** Same-Session revisions preserve physical history while excluding superseded model input. */
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { createDeveloperMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { expect, it, onTestFinished, vi } from 'vitest'
import { installSessionReadTestServices } from './test-remote.ts'
import { editLatestMessage } from '../src/edit-message.ts'
import type { SessionRequestId } from '../src/types.ts'

async function fixture() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SessionStore)
  installSessionReadTestServices(ctx)
  const session = ctx.sessions.create(SessionId('edit-fixture'))
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  const earlier = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'earlier context' }], source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  const original = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'old request' }], source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('developer/message', { turn: 1, step: 1, message: createDeveloperMessage({
    content: [{ type: 'text', text: 'superseded context' }], source: { kind: 'user' },
  }) }, { surfaceOp: 'append' })
  const followup = vi.fn()
  const agent: Parameters<typeof editLatestMessage>[0] = { session, status: 'idle', inbox: { nextTurn: [], nextStep: [] }, followup,
    runMaintenance: <T>(task: (signal: AbortSignal) => Promise<T>) => task(new AbortController().signal) }
  const read = () => ctx.sessionQuery.observeSession(session.id)
  const request = { sessionId: session.id, seq: original.seq, text: 'revised request', requestId: 'edit-1' as SessionRequestId }
  const flush = vi.fn(() => Promise.resolve())
  return { ctx, session, earlier, original, agent, followup, read, request, flush }
}

it('keeps the same Session, withdraws the old model-visible tail, and queues the revised prompt', async () => {
  const f = await fixture()
  await editLatestMessage(f.agent, f.request, f.read, f.flush)
  expect(f.session.id).toBe(f.request.sessionId)
  expect(f.session.deriveMessages().map(message => message.content)).toEqual([[{ type: 'text', text: 'earlier context' }]])
  expect(f.followup).toHaveBeenCalledWith(expect.objectContaining({
    content: [{ type: 'text', text: 'revised request' }], source: { kind: 'user', rpcId: 'edit-1' },
  }))
  using observed = await f.read()
  expect(observed.events).toContainEqual(f.original)
  expect(observed.events.at(-1)).toMatchObject({ type: 'developer/message',
    data: { turn: 1, step: 1, message: { content: [], source: { kind: 'message-edit', startSeq: f.original.seq, endSeq: 4 } } } })
  expect(f.flush).toHaveBeenCalledOnce()
})

it('rejects a stale message or active work without changing model history', async () => {
  const f = await fixture()
  const before = f.session.seq
  await expect(editLatestMessage(f.agent, { ...f.request, seq: f.earlier.seq }, f.read, f.flush))
    .rejects.toMatchObject({ message: 'MESSAGE_EDIT_NOT_LATEST' })
  await expect(editLatestMessage({ ...f.agent, status: 'running' }, f.request, f.read, f.flush))
    .rejects.toMatchObject({ message: 'MESSAGE_EDIT_BUSY' })
  await expect(editLatestMessage(f.agent, { ...f.request, text: '  ' }, f.read, f.flush))
    .rejects.toMatchObject({ message: 'MESSAGE_EDIT_EMPTY' })
  expect(f.session.seq).toBe(before)
  expect(f.followup).not.toHaveBeenCalled()
})

it('refuses an edited message already shadowed by compaction', async () => {
  const f = await fixture()
  f.session.append('developer/message', { turn: 1, step: 1, message: createDeveloperMessage({
    content: [{ type: 'text', text: 'summary' }], source: { kind: 'user' },
  }) }, { surfaceOp: { op: 'replace', startSeq: f.original.seq, endSeq: f.original.seq }, sourceEventSeqs: [f.original.seq] })
  await expect(editLatestMessage(f.agent, f.request, f.read, f.flush)).rejects.toMatchObject({ message: 'MESSAGE_EDIT_COMPACTED' })
  expect(f.followup).not.toHaveBeenCalled()
})

it('regenerates through a real Agent loop without resending the old prompt or reply', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx)
  installSessionReadTestServices(ctx)
  const adapter = new MockAdapter([textResponse('old answer'), textResponse('new answer')])
  ctx.llm.registerAdapter(['edit-test'], adapter)
  const loop = await mountAgentLoopTestHarness(ctx)
  const agent = await loop.create(SessionId('real-message-edit'), { provider: 'edit-test', model: 'local' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'old question' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  using original = await ctx.sessionQuery.observeSession(agent.id)
  const prompt = original.events.findLast(event => event.type === 'user/message' && event.data.source.kind === 'user')
  if (prompt === undefined) throw new Error('Original prompt missing')
  await editLatestMessage(agent, { sessionId: agent.id, seq: prompt.seq, text: 'new question',
    requestId: 'real-edit-1' as SessionRequestId }, () => ctx.sessionQuery.observeSession(agent.id), async () => {})
  await agent.whenIdle()
  expect(adapter.requests).toHaveLength(2)
  const input = JSON.stringify(adapter.requests[1]?.messages)
  expect(input).toContain('new question')
  expect(input).not.toContain('old question')
  expect(input).not.toContain('old answer')
  const answers = agent.session.deriveMessages().flatMap(message => message.content)
  expect(answers).toContainEqual({ type: 'text', text: 'new answer' })
})
