import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { readTranscript, transcriptSessionId } from '../src/transcript.ts'

it('accepts only exact local IDs and deep links', () => {
  expect(transcriptSessionId('dsh://session/abc')).toBe('abc')
  for (const value of ['https://example.com', 'dsh://session/a?x=1', 'dsh://session/%2Fetc', '../secret', 'dsh://session/%00']) expect(() => transcriptSessionId(value)).toThrow()
})
it('reads a frozen paged transcript, hides edited history and disposes observation', async () => {
  const ctx = new Context()
  const disposed = vi.fn()
  const events = [
    { seq: 1, type: 'user/message', surfaceOp: 'append', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'old question' }] } },
    { seq: 2, type: 'assistant/message', surfaceOp: 'append', data: { message: { content: [{ type: 'text', text: 'old answer' }] } } },
    { seq: 3, type: 'user/message', surfaceOp: 'append', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'new question' }] } },
    { seq: 4, type: 'developer/message', data: { message: { source: { kind: 'message-edit', startSeq: 1, endSeq: 2 } } } },
    { seq: 5, type: 'assistant/message', surfaceOp: 'append', data: { message: { content: [{ type: 'reasoning', text: 'secret' }, { type: 'text', text: 'new answer' }] } } },
  ]
  const observeSession = vi.fn(async () => ({ events, [Symbol.dispose]: disposed }))
  ctx.provide('sessionQuery', { observeSession } as never)
  const signal = new AbortController().signal
  const first = await readTranscript(ctx, 'dsh://session/test', 0, undefined, signal, 12)
  const second = await readTranscript(ctx, 'test', first.nextOffset!, first.throughSeq, signal, 1000)
  expect(first.text + second.text).toBe('## User\n\nnew question\n\n## Assistant\n\nnew answer\n')
  expect(second.nextOffset).toBeNull()
  expect(disposed).toHaveBeenCalledTimes(2)
  expect(observeSession).toHaveBeenCalledWith('test', { signal, projectionMode: 'none' })
  await expect(readTranscript(ctx, 'test', 0, 99, signal, 12)).rejects.toThrow('newer')
})
