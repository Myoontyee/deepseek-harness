/** Model commands available only inside the saved-target SSH Session preset. */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from './index.ts'
/** Required model-tool registry and saved-connection controller. */
export const inject = ['tools', 'connectionController']
/**
 * Register remote execution without accepting a model-supplied host or credential.
 * @param ctx - SSH preset context.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(
    defineTool({
      name: 'ssh_exec',
      description:
        "Execute a POSIX command on this conversation's pinned SSH server, only for work requested by the user. Each call starts a separate non-interactive shell in the saved remote directory. SSH account permissions apply. No local fallback exists. Cancellation, disconnect or timeout may leave remote work running: inspect its outcome before retrying. Use explicit paths and report failures honestly.",
      parameters: {
        command: {
          type: 'string',
          required: true,
          description: 'The remote shell command. Keep the task bounded; use a remote job manager for long-running work.',
        },
      },
      presentCall: args => ({ card: 'generic', title: 'SSH', kind: 'execute', rawInput: args.command }),
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(args, execution) {
        if (!execution.agent) throw new Error('An active SSH conversation is required')
        const result = await ctx.connectionController.execute(execution.agent, args.command, execution.signal)
        return JSON.stringify({
          ...result,
          remoteOutcome: result.timedOut || result.exitCode === null || result.exitCode === 255 ? 'unknown' : 'reported',
        })
      },
    }),
  )
}
