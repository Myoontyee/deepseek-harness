import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { sessionMarkdown } from '../src/markdown.ts'

function event(type: string, data: object, surfaceOp: unknown = 'append'): SessionEvent {
  return { type, data, surfaceOp, seq: 0, time: 1 } as SessionEvent
}

const user = (text: string) => event('user/message', {
  id: 'message', source: { kind: 'user' }, content: [{ type: 'text', text }],
})
const assistant = (text: string) => event('assistant/message', {
  message: { role: 'assistant', content: [{ type: 'text', text }] },
})

describe('Session Markdown transcript', () => {
  it('keeps all original human and assistant Markdown through later context replacement', () => {
    const events = [
      user('Old question'), assistant('```ts\nconst answer = 42\n```'),
      event('user/message', { source: { kind: 'compact-checkpoint' }, content: [{ type: 'text', text: 'Internal summary' }] }, { op: 'replace', startSeq: 0, endSeq: 1 }),
      user('New question'), assistant('New **answer**'),
    ]
    expect(sessionMarkdown(events, 'en')).toBe('## User\n\nOld question\n\n## Assistant\n\n```ts\nconst answer = 42\n```\n\n## User\n\nNew question\n\n## Assistant\n\nNew **answer**\n')
  })

  it('omits system context, injected user-role context, tool results and reasoning', () => {
    const events = [
      event('system/message', { content: 'System instructions' }),
      event('user/message', { source: { kind: 'agent-instructions' }, content: [{ type: 'text', text: 'Private context' }] }),
      event('tool/result', { message: { content: [{ type: 'text', text: 'Raw tool output' }] } }),
      event('assistant/message', { message: { content: [{ type: 'reasoning', text: 'Internal reasoning' }, { type: 'text', text: 'First' }, { type: 'text', text: ' second' }] } }),
    ]
    expect(sessionMarkdown(events, 'zh')).toBe('## 助手\n\nFirst second\n')
  })

  it('retains attachment names without embedding private attachment transport URLs', () => {
    const events = [event('user/message', {
      source: { kind: 'user' }, content: [
        { type: 'text', text: 'Review these' },
        { type: 'file', attachment: { name: 'report[final].pdf', attachmentId: 'secret-file' } },
        { type: 'image', attachment: { attachmentId: 'secret-image', mediaType: 'image/png' } },
      ],
    })]
    const result = sessionMarkdown(events, 'en')
    expect(result).toContain('Review these')
    expect(result).toContain('report\\[final\\].pdf')
    expect(result).toContain('Image attachment')
    expect(result).not.toContain('secret-')
  })

  it('does not cap long conversations at the browser history page size', () => {
    const events = Array.from({ length: 125 }, (_, index) => user(`Message ${index}`))
    const result = sessionMarkdown(events, 'en')
    expect(result.match(/^## User$/gm)).toHaveLength(125)
    expect(result).toContain('Message 0\n')
    expect(result).toContain('Message 124\n')
  })

  it('returns an empty transcript when no committed conversation text exists', () => {
    expect(sessionMarkdown([], 'en')).toBe('')
    expect(sessionMarkdown([assistant('')], 'en')).toBe('')
  })
})
