/** Explicit user mentions only; retrieved transcripts and model replies never select a speaker. */
import type { DiscussionAssistant } from './types.ts'

/**
 * Resolve a chip or a literal @name outside fenced code and quoted lines.
 * @param text - Newly submitted user text, never prior transcript content.
 * @param assistants - Current saved identities, including archived profiles.
 * @returns One unambiguous active identity, or undefined when no assistant was addressed.
 */
export function mentionedAssistant(text: string, assistants: readonly DiscussionAssistant[]): DiscussionAssistant | undefined {
  const prose = text.replace(/^<dsh-response-annotations>\n[^]*?\n<\/dsh-response-annotations>\n\n/u, '')
    .replace(/```[^]*?```|~~~[^]*?~~~|`[^`\n]*`|^\s*>.*$/gmu, '')
  const ids = [...prose.matchAll(/\[@[^\]\n]*\]\(dsh-assistant:([a-zA-Z0-9-]+)\)/gu)].map(match => match[1])
  const plain = prose.replace(/\[[^\]]*\]\([^)]*\)/gu, '')
  const named = assistants.filter((assistant) => {
    const escaped = assistant.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    return new RegExp(`(?:^|\\s)@${escaped}(?=$|[\\s，。！？,:：!?])`, 'u').test(plain)
  })
  const selected = new Set([...ids, ...named.map(value => value.id)])
  if (selected.size > 1) throw new Error('Please address one saved assistant per message / 每条消息请选择一个助手')
  const id = [...selected][0]
  if (id === undefined) return undefined
  const assistant = assistants.find(value => value.id === id)
  if (!assistant || assistant.archived) throw new Error('The mentioned assistant is unavailable / 指定助手已停用或不存在')
  if (!assistant.provider || !assistant.model) throw new Error('Select this assistant’s model in Settings → Saved assistants / 请先在设置 → 常驻助手中选择模型')
  return assistant
}
