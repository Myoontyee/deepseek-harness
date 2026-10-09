/** Same-Session revisions preserve physical history while excluding superseded model input. */
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { createDeveloperMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { expect, it, onTestFinished, vi } from 'vitest'
import { installSessionReadTestServices } from './test-remote.ts'
import { editLatestMessage, installMessageRevisions } from '../src/edit-message.ts'
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
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const followup = vi.fn()
  const agent: Parameters<typeof editLatestMessage>[0] = { session, status: 'idle', inbox: { nextTurn: [], nextStep: [] }, followup,
    runMaintenance: <T>(task: (signal: AbortSignal) => Promise<T>) => task(new AbortController().signal) }
  const read = () => ctx.sessionQuery.observeSession(session.id)
  const request = { sessionId: session.id, seq: original.seq, text: 'revised request', requestId: 'edit-1' as SessionRequestId }
  const flush = vi.fn(() => Promise.resolve())
  return { ctx, session, earlier, original, agent, followup, read, request, flush }
}

it('queues revision intent while leaving the completed Session log untouched', async () => {
  const f = await fixture()
  const before = f.session.seq
  await editLatestMessage(f.agent, f.request, f.read, f.flush)
  expect(f.session.seq).toBe(before)
  expect(f.session.id).toBe(f.request.sessionId)
  expect(JSON.stringify(f.session.deriveMessages())).toContain('old request')
  expect(f.followup).toHaveBeenCalledWith(expect.objectContaining({
    content: [{ type: 'text', text: 'revised request' }], source: { kind: 'user', rpcId: 'edit-1', edit: { startSeq: f.original.seq, endSeq: before - 1, surfaceEndSeq: 4 } },
  }))
  using observed = await f.read()
  expect(observed.events).toContainEqual(f.original)
  expect(observed.events.at(-1)).toMatchObject({ type: 'turn/end' })
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
  installMessageRevisions(ctx)
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


it.each(['completed', 'queued'] as const)('reopens a %s edit from its compressed disk log after shutdown', async (state) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-message-edit-restart-'))
  const restartRoot = await mkdtemp(join(tmpdir(), 'dsh-message-edit-reopen-'))
  const contexts: Context[] = []
  onTestFinished(async () => {
    for (const ctx of contexts.reverse()) await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    await rm(restartRoot, { recursive: true, force: true })
  })
  async function boot(adapter: MockAdapter, directory = root) {
    const ctx = new Context()
    contexts.push(ctx)
    await mountAgentLoopTestDependencies(ctx)
    installMessageRevisions(ctx)
    await ctx.plugin(JsonlSessionPersistence, { root: directory })
    installSessionReadTestServices(ctx)
    ctx.llm.registerAdapter(['edit-test'], adapter)
    await mountAgentLoopTestHarness(ctx)
    return ctx
  }
  const ctx = await boot(new MockAdapter([textResponse('old answer'), textResponse('new answer')]))
  const id = SessionId('edit-then-restart')
  const { agent } = await ctx.agents.create({ sessionId: id, agentOptions: { provider: 'edit-test', model: 'local' } })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'old question' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  using observed = await ctx.sessionQuery.observeSession(id)
  const prompt = observed.events.findLast(event => event.type === 'user/message')
  if (!prompt) throw new Error('Missing prompt')
  // Suspend only the driver's wake to model a process exiting after the durable enqueue.
  if (state === 'queued') vi.spyOn(agent, 'followup').mockImplementation((message) => { agent.inbox.append('next-turn', message) })
  await editLatestMessage(agent, { sessionId: id, seq: prompt.seq, text: 'new question', requestId: 'restart-edit' as SessionRequestId },
    () => ctx.sessionQuery.observeSession(id), () => ctx.sessions.flush(agent.session))
  await agent.whenIdle()
  await ctx.sessions.flush(agent.session)
  await cp(root, restartRoot, { recursive: true, filter: path => basename(path) !== 'session.lock' })
  await ctx.fiber.dispose()

  const adapter = new MockAdapter(state === 'queued' ? [textResponse('new answer'), textResponse('after restart')] : [textResponse('after restart')])
  const reopened = await boot(adapter, restartRoot)
  const resumed = await reopened.agents.resume({ resumeSessionId: id, agentOptions: { provider: 'edit-test', model: 'local' } })
  if (state === 'queued') {
    // Resuming a saved queue does not itself authorize a wake; a normal follow-up drives it.
    resumed.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'continue' }], source: { kind: 'user' } }))
    await resumed.agent.whenIdle()
  }
  expect(JSON.stringify(resumed.agent.session.deriveMessages())).toContain('new answer')
  expect(JSON.stringify(resumed.agent.session.deriveMessages())).not.toContain('old question')
  if (state === 'completed') {
    resumed.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'continue' }], source: { kind: 'user' } }))
    await resumed.agent.whenIdle()
  }
  expect(JSON.stringify(adapter.requests[0]?.messages)).toContain('new question')
  expect(JSON.stringify(adapter.requests[0]?.messages)).not.toContain('old answer')
  await reopened.sessions.flush(resumed.agent.session)
  const reader = await reopened.sessionPersistence.open(id, 'read')
  try {
    const stored = await reader.read()
    expect(stored.events.filter(event => event.type === 'turn/start').map(event => event.data.turn)).toEqual([1, 2, 3])
    expect(JSON.stringify(stored.events)).toContain('old question')
  } finally {
    await reader.close()
  }
})


it('does not withdraw history when admission rejects an edited prompt', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx)
  installMessageRevisions(ctx)
  installSessionReadTestServices(ctx)
  const adapter = new MockAdapter([textResponse('original reply'), textResponse('continued')])
  ctx.llm.registerAdapter(['edit-test'], adapter)
  const loop = await mountAgentLoopTestHarness(ctx)
  const agent = await loop.create(SessionId('rejected-edit'), { provider: 'edit-test', model: 'local' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'original question' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  using observed = await ctx.sessionQuery.observeSession(agent.id)
  const prompt = observed.events.findLast(event => event.type === 'user/message')
  if (!prompt) throw new Error('Missing prompt')
  const dispose = ctx.on('agent/pre-step', async ({ turn }, next) => {
    const decision = await next()
    return turn === 2 ? { kind: 'reject' } : decision
  })
  await editLatestMessage(agent, { sessionId: agent.id, seq: prompt.seq, text: 'rejected question', requestId: 'rejected-edit' as SessionRequestId },
    () => ctx.sessionQuery.observeSession(agent.id), async () => {})
  await agent.whenIdle()
  dispose()
  expect(adapter.requests).toHaveLength(1)
  expect(JSON.stringify(agent.session.deriveMessages())).toContain('original reply')
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'continue' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect(JSON.stringify(adapter.requests[1]?.messages)).toContain('original question')
  expect(JSON.stringify(adapter.requests[1]?.messages)).not.toContain('rejected question')
})
