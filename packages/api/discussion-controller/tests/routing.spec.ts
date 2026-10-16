/** Real loop requests and persisted identity snapshots, without API traffic. */
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { installModelSelection } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LlmRuntime, { createUserMessage, LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { assistantReturnRoute, installAssistantRouting } from '../src/routing.ts'
import { assistantRecord } from '../src/spec.ts'

class Adapter extends LlmAdapter {
  requests: GenerateOptions[] = []
  override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
  override async *stream(request: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(request)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: `answer from ${request.model}` }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: `answer from ${request.model}` } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

it('routes mentions with history and restores the ordinary model without rewriting reply identities', async () => {
  const ctx = new Context(), adapter = new Adapter()
  try {
    for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry]) {
      await ctx.plugin(plugin)
    }
    await ctx.plugin(AgentLoop, { agents: [] })
    ctx.llm.registerAdapter(['normal', 'specialist'], adapter)
    let assistant = assistantRecord.parse({ id: 'reviewer', revision: 1, name: 'Reviewer', instructions: 'Check evidence',
      template: 'resident', memoryMode: 'assistant', provider: 'specialist', model: 'review-model', avatar: '🦉', showModel: true,
      archived: false, createdAt: 1, updatedAt: 1 })
    const routing = (scope: Context): void => {
      installAssistantRouting(scope, () => [assistant], () => undefined, () => 'Confirmed preference: Chinese',
        agent => Promise.resolve(agent.session.snapshotEvents()))
    }
    const routingFiber = await ctx.plugin(routing)
    const agent = await ctx.agentLoop.create(SessionId('mention-conversation'), { provider: 'normal', model: 'ordinary' })
    installModelSelection(agent.ctx, {
      get current() {
        const logged = agent.session.requestHeader()?.config
        return logged ? { provider: logged.provider, model: logged.model } : { provider: 'normal', model: 'ordinary' }
      }, assembled: undefined,
    })
    const send = async (text: string) => {
      agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
      await agent.whenIdle()
    }
    await send('Earlier context: the number is 42')
    await send('Please @Reviewer explain the earlier number')
    expect(adapter.requests).toHaveLength(2)
    expect(adapter.requests[1]).toMatchObject({ provider: 'specialist', model: 'review-model' })
    expect(JSON.stringify(adapter.requests[1]?.messages)).toContain('the number is 42')
    expect(JSON.stringify(adapter.requests[1]?.messages)).toContain('Confirmed preference: Chinese')
    const identity = agent.session.snapshotEvents().find(event => event.type === 'user/message' && event.data.source.kind === 'saved-assistant')
    expect(identity?.data).toMatchObject({ source: { turn: 2, step: 1, speaker: { name: 'Reviewer', avatar: '🦉', modelName: 'review-model' } } })
    expect(assistantReturnRoute(agent.session.snapshotEvents(), { provider: 'normal', model: 'ordinary' })).toMatchObject({
      wasAssistant: true, route: { provider: 'normal', model: 'ordinary' },
    })
    await routingFiber.dispose()
    await ctx.plugin(routing)
    assistant = { ...assistant, name: 'New name', avatar: '🐼' }
    await send('Continue as the ordinary assistant')
    expect(adapter.requests[2]).toMatchObject({ provider: 'normal', model: 'ordinary' })
    expect(identity?.data).toMatchObject({ source: { speaker: { name: 'Reviewer', avatar: '🦉' } } })
    await send('@New name explain again')
    await send('@New name continue')
    expect(adapter.requests[3]).toMatchObject({ provider: 'specialist', model: 'review-model' })
    expect(adapter.requests[4]).toMatchObject({ provider: 'specialist', model: 'review-model' })
    agent.session.append('model/selection', { provider: 'normal', model: 'new-user-choice' })
    await send('Use my newly selected ordinary model')
    expect(adapter.requests[5]).toMatchObject({ provider: 'normal', model: 'new-user-choice' })
  } finally { await ctx.fiber.dispose() }
})
