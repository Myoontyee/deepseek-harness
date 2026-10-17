/** Existing assistant turns resume as ordinary conversations after retirement. */
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { installModelSelection } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LlmRuntime, { createUserMessage, LlmAdapter, ReasoningEffortId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { installAssistantRouting } from '../src/routing.ts'
import { installAssistantRetirement } from '../src/retirement.ts'
import { assistantRecord } from '../src/spec.ts'

class Adapter extends LlmAdapter {
  requests: GenerateOptions[] = []
  override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model, reasoning: {
    efforts: ['low', 'high', 'max'].map(id => ({ id: ReasoningEffortId(id), name: id })), defaultEffort: ReasoningEffortId('high'),
  } } }
  override async *stream(request: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(request)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'Fixture reply' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Fixture reply' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

it.each([false, true])('retires an old role and honors a newer explicit model choice (%s)', async (manual) => {
  const ctx = new Context(), adapter = new Adapter()
  try {
    for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry]) {
      await ctx.plugin(plugin)
    }
    await ctx.plugin(AgentLoop, { agents: [] })
    ctx.llm.registerAdapter(['normal', 'specialist'], adapter)
    const profile = assistantRecord.parse({ id: 'old-helper', revision: 1, name: 'Old helper', instructions: 'Old role',
      template: 'resident', memoryMode: 'assistant', provider: 'specialist', model: 'old-specialist', reasoningEffort: 'max',
      archived: false, createdAt: 1, updatedAt: 1 })
    const legacy = await ctx.plugin(scope => installAssistantRouting(scope, () => [profile], () => undefined, () => 'Old memory',
      agent => Promise.resolve(agent.session.snapshotEvents().slice(agent.session.inheritedEventCount))))
    const agent = await ctx.agentLoop.create(SessionId('retirement-fixture'), { provider: 'normal', model: 'ordinary' })
    installModelSelection(agent.ctx, { get current() {
      const logged = agent.session.requestHeader()?.config
      return logged ? { provider: logged.provider, model: logged.model,
        ...(logged.reasoningEffort === undefined ? {} : { reasoningEffort: logged.reasoningEffort }) }
        : { provider: 'normal', model: 'ordinary', reasoningEffort: ReasoningEffortId('low') }
    }, assembled: undefined })
    const send = async (text: string) => {
      agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
      await agent.whenIdle()
    }
    await send('Ordinary context')
    await send('@Old helper answer')
    expect(adapter.requests[1]).toMatchObject({ model: 'old-specialist', reasoningEffort: 'max' })
    const prefix = agent.session.snapshotEvents()
    await legacy.dispose()
    await ctx.plugin(scope => installAssistantRetirement(scope,
      value => Promise.resolve(value.session.snapshotEvents().slice(value.session.inheritedEventCount))))
    if (manual) agent.session.append('model/selection', { provider: 'normal', model: 'manual', reasoningEffort: ReasoningEffortId('high') })
    await send('[@Old helper](dsh-assistant:old-helper) is now ordinary reference text')
    expect(adapter.requests[2]).toMatchObject({ provider: 'normal', model: manual ? 'manual' : 'ordinary', reasoningEffort: manual ? 'high' : 'low' })
    expect(JSON.stringify(adapter.requests[2]?.messages)).toContain('have been retired')
    await send('Continue normally')
    expect(adapter.requests[3]).toMatchObject({ provider: 'normal', model: manual ? 'manual' : 'ordinary' })
    const events = agent.session.snapshotEvents()
    expect(events.slice(0, prefix.length)).toEqual(prefix)
    expect(events.filter(event => event.type === 'user/message' && event.data.source.kind === 'saved-assistant')).toHaveLength(1)
    expect(events.filter(event => event.type === 'user/message' && event.data.source.kind === 'saved-assistant-return')).toHaveLength(1)
  } finally { await ctx.fiber.dispose() }
})
