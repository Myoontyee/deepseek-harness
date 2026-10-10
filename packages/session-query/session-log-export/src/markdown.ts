/** Human and Assistant transcript export from the complete committed Session log. */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-attachment'

const labels = {
  en: { user: 'User', assistant: 'Assistant', file: 'File attachment', image: 'Image attachment' },
  zh: { user: '用户', assistant: '助手', file: '文件附件', image: '图片附件' },
}

type Copy = typeof labels.en
type Content = SessionEvent<'user/message'>['data']['content']

function attachmentLabel(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/[\\[\]`*_<>]/g, '\\$&')
}

function messageText(content: Content, copy: Copy): string {
  const parts: string[] = []
  for (const block of content) {
    switch (block.type) {
      case 'text':
        parts.push(block.text)
        break
      case 'file':
        parts.push(`\n\n[${copy.file}: ${attachmentLabel(block.attachment.name)}]\n\n`)
        break
      case 'image':
        parts.push(`\n\n[${copy.image}]\n\n`)
        break
      default:
        // Reasoning, tool calls, and plugin-only payloads are not conversation prose.
        break
    }
  }
  return parts.join('').trim()
}

/**
 * Render every original committed human message and Assistant reply, including
 * messages later removed from model context by compaction. Internal injections,
 * replacement summaries, reasoning, and tools remain outside this transcript.
 * @param events - the complete immutable logical log, in sequence order.
 * @param locale - language of role and attachment labels.
 * @param includeRelay - Include explicitly attributed cross-session messages for the reader.
 * @returns Markdown with original message formatting and a final newline, or empty text.
 */
export function sessionMarkdown(events: readonly SessionEvent[], locale: 'en' | 'zh', includeRelay = false): string {
  const copy = labels[locale]
  const messages: string[] = []
  for (const event of events) {
    if (event.surfaceOp !== 'append') continue
    if (event.type === 'user/message') {
      const kind: string = event.data.source.kind
      if (kind !== 'user' && !(includeRelay && kind === 'session-relay')) continue
      const text = messageText(event.data.content, copy)
      if (text !== '') messages.push(`## ${copy.user}\n\n${text}`)
    } else if (event.type === 'assistant/message') {
      const text = messageText(event.data.message.content, copy)
      if (text !== '') messages.push(`## ${copy.assistant}\n\n${text}`)
    }
  }
  return messages.length === 0 ? '' : `${messages.join('\n\n')}\n`
}
