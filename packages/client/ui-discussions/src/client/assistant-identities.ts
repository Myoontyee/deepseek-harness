/** Project reply identity from the same durable notice used by model routing. */
import type { Context } from '@deepseek-ai/cordis'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { AssistantSpeaker } from '@deepseek-ai/dsh-api-discussion-controller/types'

/** Per-turn reply identities remain stable when the saved profile is later renamed. */
export const assistantIdentities: ConversationNodeDefinition<Readonly<Record<number, AssistantSpeaker>>> = {
  kind: 'assistant-identities',
  match: event => event.type === 'user/message' && event.data.source.kind === 'saved-assistant'
    ? { id: String(event.data.source.turn), role: 'start' } : null,
  start: (_context, match) => match.event.type === 'user/message' && match.event.data.source.kind === 'saved-assistant'
    ? { [match.event.data.source.step]: match.event.data.source.speaker } : {},
  update: (context, match) => match.event.type === 'user/message' && match.event.data.source.kind === 'saved-assistant'
    ? { ...context.state, [match.event.data.source.step]: match.event.data.source.speaker } : context.state,
  buildLocationData: (context, scope) => scope === 'turn' && context.state
    ? { kind: 'turn', turn: Number(context.id), key: 'assistant-identities', value: context.state } : null,
}

/** Register durable reply identities with the native conversation projection.
 * @param ctx - Owning Client plugin scope.
 */
export function registerAssistantIdentities(ctx: Context): void {
  ctx.effect(() => ctx.uiConversation.events.register({ ...assistantIdentities,
    match: { 'user/message': event => assistantIdentities.match(event) } }))
}
