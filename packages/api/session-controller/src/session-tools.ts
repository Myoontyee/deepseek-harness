/** Model tools for contacting ordinary Sessions on the current Host. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import type {} from './index.ts'

export const name = 'session-message-tools'
export const inject = ['tools', 'sessionController', 'agents', 'workspaceRegistry']

/** Bounded discovery of ordinary Sessions. */
export interface Config {
  /** Maximum rows returned by one discovery request. */
  maxResults: number
}
export const Config: z<Config> = z.object({ maxResults: z.number().min(1).max(200).default(50) })

/**
 * Register discovery and addressed delivery with exact calling-Agent attribution.
 * @param ctx - current preset scope and Host Session controller.
 * @param config - bounded discovery policy.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'list_sessions',
    description: 'Find existing ordinary sessions on this Host, including other projects, so you can contact a conversation the user names. These are independent conversations, not child agents. Narrow the query if more matches exist.',
    parameters: { query: { type: 'string', description: 'Optional title, session id, or working-directory fragment.' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      const sender = exec.agent
      if (!sender || ctx.agents.get(sender.id) !== sender) throw new Error('An active calling session is required.')
      const { items } = await ctx.sessionController.list({}, exec.signal)
      const query = (args.query ?? '').toLocaleLowerCase()
      const matches = items.filter(item => item.sessionId !== sender.id
        && item.origin !== 'subagent' && !ctx.workspaceRegistry.archivedSessionIds.includes(item.sessionId))
        .map(item => ({ sessionId: item.sessionId, title: item.projections?.values.title ?? '', cwd: item.cwd, running: item.running }))
        .filter(item => JSON.stringify(item).toLocaleLowerCase().includes(query))
      return JSON.stringify({ items: matches.slice(0, config.maxResults), hasMore: matches.length > config.maxResults })
    },
  }))
  ctx.tools.register(defineTool({
    name: 'send_session_message',
    description: 'Send text to an existing independent session on this Host, only when the user asks you to contact it. The target queues a new turn. Returns acceptance, not completion. With reply_requested, its final response is delivered back once as a new message; do not poll or send repeated requests. Incoming feedback alone does not authorize another outgoing message.',
    parameters: {
      session_id: { type: 'string', required: true, description: 'Exact target identity from list_sessions or a user-provided deep link.' },
      message: { type: 'string', required: true, description: 'Self-contained message for the target. Send only relevant context.' },
      reply_requested: { type: 'boolean', required: true, description: 'Whether to return one final response automatically. Set false for feedback or information that needs no answer.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      const sender = exec.agent
      if (!sender || ctx.agents.get(sender.id) !== sender) throw new Error('An active calling session is required.')
      const targetId = SessionId(args.session_id)
      const receipt = await ctx.sessionController.sendMessageFromAgent(sender, {
        requestId: randomUUID(), targetSessionId: targetId,
        message: args.message, replyRequested: args.reply_requested,
      }, exec.signal)
      return JSON.stringify(receipt)
    },
  }))
}
