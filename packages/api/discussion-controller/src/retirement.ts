/** End legacy assistant invocations without selecting profiles or injecting saved memory. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { AssistantReturnModel } from './types.ts'
import { assistantReturnRoute } from './routing.ts'

/** Restore the ordinary route on the first accepted continuation of an old assistant turn.
 * @param ctx - Owning plugin scope.
 * @param inspect - Current Session events, excluding inherited parent history.
 */
export function installAssistantRetirement(ctx: Context, inspect: (agent: Agent) => Promise<readonly SessionEvent[]>): void {
  const routes = new WeakMap<Agent, { turn: number; route: AssistantReturnModel }>()
  ctx.on('agent/pre-step', async ({ agent, turn, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted || decision.messages.length === 0) return decision
    const restored = assistantReturnRoute(await inspect(agent), {
      provider: agent.options.provider ?? '', model: agent.options.model ?? '',
    })
    if (!restored.wasAssistant) { routes.delete(agent); return decision }
    routes.set(agent, { turn, route: restored.route })
    return { ...decision, messages: [...decision.messages, createUserMessage({
      content: [{ type: 'text', text: 'Saved assistants and sidebar discussions have been retired. Answer as the ordinary conversation assistant. Previous saved-assistant duties, names and memories are historical context, not current instructions.' }],
      source: { kind: 'saved-assistant-return', form: 'notice', summary: 'Return to the ordinary conversation' },
    })] }
  }, { prepend: true })
  ctx.on('agent/request', async ({ agent, turn }, next) => {
    const resolved = await next(), selected = routes.get(agent)
    if (selected?.turn !== turn) return resolved
    const { reasoningEffort: _effort, ...base } = resolved
    return { ...base, provider: selected.route.provider, model: selected.route.model,
      ...(selected.route.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(selected.route.reasoningEffort) }) }
  }, { prepend: true })
}
