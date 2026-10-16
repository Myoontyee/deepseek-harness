/** Saved assistants join the existing @ menu without replacing file or session references. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { DiscussionAssistant } from '@deepseek-ai/dsh-api-discussion-controller/types'
import type { UserTextRule } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Show the original nickname while retaining the stable reference in the submitted source. */
export const assistantReferenceRule: UserTextRule = {
  id: 'saved-assistant-label', order: 5,
  match(text, from) {
    const pattern = /\[(@[^\]\n]*)\]\(dsh-assistant:[a-zA-Z0-9-]+\)/gu
    pattern.lastIndex = from
    const match = pattern.exec(text)
    return match ? { id: 'text', start: match.index, end: match.index + match[0].length,
      data: { text: match[0], display: match[1] ?? '' } } : undefined
  },
}

/** Register saved identities alongside other @ candidates.
 * @param ctx - The authenticated Client plugin scope.
 */
export function registerAssistantMentions(ctx: Context): void {
  ctx.effect(() => ctx.uiConversation.userText.register(assistantReferenceRule))
  const t = ctx.locale.bind('discussions')
  let rows: DiscussionAssistant[] = []
  ctx.effect(() => ctx.inputTriggers.registerSource({
    trigger: '@', name: 'saved-assistants', order: -20, showGroupTitle: false,
    candidates: async (_session, request) => {
      if (request.quoted || request.drilled) return []
      const result = await ctx.remote.discussions.assistants()
      if (!result.ok) throw new Error(result.error.message)
      if (request.signal.aborted) return []
      rows = result.value.filter(row => !row.archived)
      return rows.filter(row => row.name.toLocaleLowerCase().includes(request.query.toLocaleLowerCase()))
        .map(row => ({ name: row.name, value: row.id, section: t('assistants'), icon: 'session' as const,
          description: row.model ?? t('chooseModel') }))
    },
    onPick: ({ candidate }) => {
      const row = rows.find(item => item.id === candidate.value)
      if (!row) return undefined
      const ref = `[@${row.name.replace(/[\[\]\\\r\n]/gu, '')}](dsh-assistant:${row.id})`
      return { insert: { source: 'saved-assistants', ref, label: `@${row.name}`, appearance: 'session', clipboardText: ref } }
    },
    codec: { clipboardText: ref => ref, serialize: ref => Promise.resolve(ref) },
  }))
}
