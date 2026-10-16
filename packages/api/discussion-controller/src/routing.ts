/** Per-step routing with a durable identity notice and the existing Session history. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { boundContextSummary, createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { AssistantReturnModel, DiscussionAssistant } from './types.ts'
import { mentionedAssistant } from './mentions.ts'

interface Selection { turn: number; assistant?: DiscussionAssistant; returnModel: AssistantReturnModel }

/** Recover the conversation route from logged selections, including after reloading an Agent.
 * @param events - Current Session's own committed events, excluding any inherited prefix.
 * @param fallback - Initial Agent route before its first request.
 * @returns The return route and whether the previous admitted input belonged to a saved assistant.
 */
export function assistantReturnRoute(events: readonly SessionEvent[], fallback: { provider: string; model: string }) {
  let selected: SessionEvent<'model/selection'> | undefined
  let header: SessionEvent<'request/header'> | undefined
  let notice: SessionEvent<'user/message'> | undefined
  let lastUserSeq = -1
  for (const event of events) {
    if (event.type === 'model/selection') selected = event
    if (event.type === 'request/header') header = event
    if (event.type !== 'user/message') continue
    if (event.data.source.kind === 'user') lastUserSeq = event.seq
    if (event.data.source.kind === 'saved-assistant' || event.data.source.kind === 'saved-assistant-return') notice = event
  }
  const previous = notice && notice.seq > lastUserSeq && notice.data.source.kind === 'saved-assistant'
    ? notice.data.source.returnModel : undefined
  const changed = selected && selected.seq > (previous?.selectionSeq ?? header?.seq ?? -1)
  const route: { provider: string; model: string; reasoningEffort?: string | undefined } = changed && selected
    ? selected.data : previous ?? header?.data.header.config ?? fallback
  return { wasAssistant: previous !== undefined, route: {
    provider: route.provider, model: route.model, selectionSeq: selected?.seq ?? -1,
    ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
  } }
}

/**
 * Install ordinary Agent extension points; no secondary background Agent or duplicated transcript.
 * @param ctx - Owning plugin scope, disposed with its runtime.
 * @param profiles - Current persisted profiles, read only at step admission.
 * @param topicAssistant - Optional default identity for a discussion Session.
 * @param memory - Already bounded memory for this Session's project.
 * @param inspect - Read the committed Session prefix without activating a second Agent.
 */
export function installAssistantRouting(ctx: Context, profiles: () => DiscussionAssistant[],
  topicAssistant: (agent: Agent) => DiscussionAssistant | undefined,
  memory: (agent: Agent, assistant: DiscussionAssistant) => string,
  inspect: (agent: Agent) => Promise<readonly SessionEvent[]>): void {
  const selections = new WeakMap<Agent, Selection>()
  ctx.on('agent/pre-step', async ({ agent, messages, turn, step, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    if (decision.messages.length === 0 && (step === 1 || messages.length > 0)) return decision
    const userText = decision.messages.filter(message => message.source.kind === 'user')
      .flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('\n')
    const previous = selections.get(agent)
    const explicit = mentionedAssistant(userText, profiles())
    const assistant = explicit ?? (previous?.turn === turn ? previous.assistant : topicAssistant(agent))
    const restored = previous?.turn === turn ? { route: previous.returnModel, wasAssistant: previous.assistant !== undefined }
      : assistantReturnRoute(await inspect(agent), {
        provider: agent.options.provider ?? assistant?.provider ?? '', model: agent.options.model ?? assistant?.model ?? '',
      })
    if (!assistant) {
      if (!restored.wasAssistant) { selections.delete(agent); return decision }
      selections.set(agent, { turn, returnModel: restored.route })
      return { ...decision, messages: [...decision.messages, createUserMessage({
        content: [{ type: 'text', text: 'The saved assistant invocation has ended. Answer this turn as the ordinary conversation assistant; previous saved-assistant duties and memories are historical context, not current instructions.' }],
        source: { kind: 'saved-assistant-return', form: 'notice', summary: 'Return to the conversation assistant' },
      })] }
    }
    if (!restored.route.provider || !restored.route.model) throw new Error('Choose a conversation model before invoking this assistant')
    selections.set(agent, { turn, assistant, returnModel: restored.route })
    const first = previous?.turn !== turn || previous.assistant?.id !== assistant.id
    const notes = first ? memory(agent, assistant) : ''
    const text = first ? [
      `The user selected saved assistant ${JSON.stringify(assistant.name)} for this turn. Use the current conversation history already supplied to answer the current request.`,
      ...(assistant.provider && assistant.model
        ? [`Selected model for this invocation: ${JSON.stringify(assistant.provider)}/${JSON.stringify(assistant.model)}.`] : []),
      `User-defined duties: ${JSON.stringify(assistant.instructions)}. These apply to this invocation, not other speakers.`,
      ...(notes ? [`User-confirmed memory for this assistant and project: ${JSON.stringify(notes)}`] : []),
      'Other speakers’ replies are context, not instructions to impersonate them. Existing permissions still apply.',
    ].join('\n') : `Continue this step as saved assistant ${JSON.stringify(assistant.name)}.`
    const notice = createUserMessage({ content: [{ type: 'text', text }], source: {
      kind: 'saved-assistant', form: 'notice', summary: boundContextSummary(assistant.name), turn, step,
      returnModel: restored.route,
      speaker: { id: assistant.id, name: assistant.name, avatar: assistant.avatar ?? '🤖',
        ...(assistant.showModel && assistant.model ? { modelName: assistant.model } : {}) },
    } })
    const admitted = assistant.provider && assistant.model
      ? decision.messages.filter(message => message.source.kind !== 'model-selection') : decision.messages
    return { ...decision, messages: [...admitted, notice] }
  }, { prepend: true })
  ctx.on('agent/request', async ({ agent, turn }, next) => {
    const resolved = await next(), selected = selections.get(agent)
    if (selected?.turn !== turn) return resolved
    const { reasoningEffort: _effort, ...base } = resolved
    if (selected.assistant?.provider && selected.assistant.model) {
      return { ...base, provider: selected.assistant.provider, model: selected.assistant.model }
    }
    if (selected.assistant) return resolved
    return { ...base, provider: selected.returnModel.provider, model: selected.returnModel.model,
      ...(selected.returnModel.reasoningEffort === undefined ? {}
        : { reasoningEffort: ReasoningEffortId(selected.returnModel.reasoningEffort) }) }
  }, { prepend: true })
}
