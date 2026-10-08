/** Same-Session revisions preserve physical history while excluding superseded model input. */
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
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
  const agent = { id: session.id, session, status: 'idle', inbox: { nextTurn: [], nextStep: [] }, followup,
    runMaintenance: <T>(task: (signal: AbortSignal) => Promise<T>) => task(new AbortController().signal) } as Agent
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
    data: { message: { content: [], source: { kind: 'message-edit', startSeq: f.original.seq, endSeq: 2 } } } })
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
