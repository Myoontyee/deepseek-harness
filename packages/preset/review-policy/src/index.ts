/** Restrict each reviewer Agent to inherited read/search tools, including preset switches. */
import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
/** Preset identity and its inherited tool allowlist. */
export interface Config {
  /** Preset identity whose Agents receive this tool restriction. */
  preset: string
  /** Permitted inherited tool names for the selected preset. */
  tools: string[]
}
/** Explicit allowlists also support dedicated SSH conversations. */
export const Config = z.object({
  /** Preset identity whose Agents receive this tool restriction. */
  preset: z.string().default('code-review'),
  /** Permitted inherited tool names for the selected preset. */
  tools: z.array(z.string()).default(['read', 'grep', 'glob']),
})
/** Required tool, Agent and preset registries. */
export const inject = ['tools', 'agents', 'agentPresets']
/**
 * Install Agent-owned restrictions after the preset has bound its read tools.
 * @param ctx - preset policy context.
 * @param config - preset identity and the permitted inherited tools.
 */
export function apply(ctx: Context, config: Config): void {
  const active = new Map<Agent, () => void>()
  const update = (agent: Agent) => {
    const selected = ctx.agentPresets.composedPreset(agent.ctx) === config.preset
    if (!selected) {
      active.get(agent)?.()
      active.delete(agent)
      return
    }
    if (active.has(agent)) return
    const tools = agent.ctx.get('tools')
    if (!tools) throw new Error('The Agent has no tool registry')
    const lift = tools.restrict({ allow: config.tools })
    const release = agent.ctx.effect(
      () => () => {
        lift()
        active.delete(agent)
      },
      'review-policy: Agent lifetime',
    )
    active.set(agent, () => {
      lift()
      void release()
    })
  }
  ctx.on('agent/created', ({ agent }) => {
    update(agent)
    return undefined
  })
  ctx.on('agent-preset/selected', (sessionId) => {
    const agent = ctx.agents.get(sessionId)
    if (agent) update(agent)
  })
  ctx.effect(
    () => () => {
      for (const release of [...active.values()]) release()
      active.clear()
    },
    'review-policy: restriction cleanup',
  )
  for (const agent of ctx.agents.list()) update(agent)
}
