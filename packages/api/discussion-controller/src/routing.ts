/** Per-step routing with a durable identity notice and the existing Session history. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { boundContextSummary, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { DiscussionAssistant } from './types.ts'
import { mentionedAssistant } from './mentions.ts'

interface Selection { turn: number; assistant: DiscussionAssistant }

/**
 * Install ordinary Agent extension points; no secondary background Agent or duplicated transcript.
 * @param ctx - Owning plugin scope, disposed with its runtime.
 * @param profiles - Current persisted profiles, read only at step admission.
 * @param topicAssistant - Optional default identity for a discussion Session.
 * @param memory - Already bounded memory for this Session's project.
 */
export function installAssistantRouting(ctx: Context, profiles: () => DiscussionAssistant[],
  topicAssistant: (agent: Agent) => DiscussionAssistant | undefined,
  memory: (agent: Agent, assistant: DiscussionAssistant) => string): void {
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
    if (!assistant) {
      selections.delete(agent)
      if (!previous) return decision
      return { ...decision, messages: [...decision.messages, createUserMessage({
        content: [{ type: 'text', text: 'The saved assistant invocation has ended. Answer this turn as the ordinary conversation assistant; previous saved-assistant duties and memories are historical context, not current instructions.' }],
        source: { kind: 'model-selection', form: 'notice', summary: 'Return to the conversation assistant' },
      })] }
    }
    selections.set(agent, { turn, assistant })
    const first = previous?.turn !== turn || previous.assistant.id !== assistant.id
    const notes = first ? memory(agent, assistant) : ''
    const text = first ? [
      `The user selected saved assistant ${JSON.stringify(assistant.name)} for this turn. Use the current conversation history already supplied to answer the current request.`,
      `User-defined duties: ${JSON.stringify(assistant.instructions)}. These apply to this invocation, not other speakers.`,
      ...(notes ? [`User-confirmed memory for this assistant and project: ${JSON.stringify(notes)}`] : []),
      'Other speakers’ replies are context, not instructions to impersonate them. Existing permissions still apply.',
    ].join('\n') : `Continue this step as saved assistant ${JSON.stringify(assistant.name)}.`
    const notice = createUserMessage({ content: [{ type: 'text', text }], source: {
      kind: 'saved-assistant', form: 'notice', summary: boundContextSummary(assistant.name), turn, step,
      speaker: { id: assistant.id, name: assistant.name, avatar: assistant.avatar ?? '🤖',
        ...(assistant.showModel && assistant.model ? { modelName: assistant.model } : {}) },
    } })
    return { ...decision, messages: [...decision.messages, notice] }
  }, { prepend: true })
  ctx.on('agent/request', async ({ agent, turn }, next) => {
    const resolved = await next(), selected = selections.get(agent)
    if (selected?.turn !== turn || !selected.assistant.provider || !selected.assistant.model) return resolved
    const { reasoningEffort: _effort, ...base } = resolved
    return { ...base, provider: selected.assistant.provider, model: selected.assistant.model }
  }, { prepend: true })
}
