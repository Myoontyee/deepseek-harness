/** Agent-scoped visibility, dispatch refusal, preset switches and plugin disposal. */
import { Context } from '@deepseek-ai/cordis'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type AgentPresetRegistry from '@deepseek-ai/dsh-agent-preset-registry'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it, onTestFinished } from 'vitest'
import * as Policy from '../src/index.ts'

it('restricts only the selected Agent and restores inherited tools on switch and unload', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  for (const name of ['read', 'grep', 'glob', 'write']) {
    const tool: ToolDefinition = {
      name,
      description: name,
      parameters: { type: 'object', properties: {} },
      output: { schema: { type: 'string' }, render: () => [{ type: 'text', text: 'fixture' }] },
      execute: () => Promise.resolve('fixture'),
    }
    ctx.tools.register(tool)
  }
  const agent = { id: 'review-fixture' as SessionId } as Agent
  let scope: Scope | undefined
  await ctx.plugin(
    Object.assign(
      (child: Context) => {
        scope = createScope(child, agent)
      },
      { inject: ['tools', 'systemPrompt'] },
    ),
  )
  if (!scope) throw new Error('Agent scope did not mount')
  Object.assign(agent, { ctx: scope.ctx })
  let selected = 'code-review'
  ctx.provide('agents', { list: () => [agent], get: (id: SessionId) => (id === agent.id ? agent : undefined) } as AgentRegistry)
  const presets: Pick<AgentPresetRegistry, 'composedPreset'> = { composedPreset: (_context: Context) => selected }
  ctx.provide('agentPresets', presets as AgentPresetRegistry)
  const policy = ctx.plugin(Policy)
  await policy
  expect(
    ctx.tools
      .schemas(agent)
      .map(tool => tool.name)
      .sort(),
  ).toEqual(['glob', 'grep', 'read'])
  expect(ctx.tools.schemas().map(tool => tool.name)).toContain('write')
  const denied = await ctx.tools.execute({
    name: 'write',
    arguments: {},
    agent,
    callId: ToolCallId('blocked'),
    signal: new AbortController().signal,
  })
  expect(denied.isError).toBe(true)
  selected = 'standard'
  ctx.emit('agent-preset/selected', agent.id, selected)
  expect(ctx.tools.schemas(agent).map(tool => tool.name)).toContain('write')
  selected = 'code-review'
  ctx.emit('agent-preset/selected', agent.id, selected)
  expect(ctx.tools.schemas(agent).map(tool => tool.name)).not.toContain('write')
  await policy.dispose()
  expect(ctx.tools.schemas(agent).map(tool => tool.name)).toContain('write')
  await scope.dispose()
})
