/** One cancellable GitHub device-code login owned by the Host plugin. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import { setTimeout as delay } from 'node:timers/promises'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import type { GithubLoginState } from './types.ts'

/** One Host login attempt; raw process output and credentials never cross Remote. */
export class GithubSignIn {
  private readonly lifetime = new AbortController()
  private attempt: { child?: SubprocessHandle } | undefined
  constructor(
    private readonly ctx: Context,
    private readonly executable: string,
    private readonly timeoutMs: number,
    private readonly graceMs: number,
  ) {
    ctx.effect(
      () => async () => {
        this.lifetime.abort()
        const child = this.attempt?.child
        if (child) {
          child.terminate()
          await child.done.catch(() => {
            /* The active stream owns failure reporting. */
          })
          await child.waitForExit()
        }
      },
      'git-controller: GitHub sign-in lifetime',
    )
  }

  /**
   * Start device-code login; closing the stream cancels and joins the process.
   * @param cwd - Host-resolved workspace directory.
   * @param signal - requesting client's stream lifetime.
   * @returns safe progress states; browser authorization remains the user's action.
   */
  async *login(cwd: string, signal: AbortSignal): AsyncIterable<GithubLoginState> {
    if (this.attempt) throw new Error('A GitHub sign-in is already in progress')
    const attempt: { child?: SubprocessHandle } = {}
    this.attempt = attempt
    const deadline = new AbortController()
    const timer = setTimeout(() => {
      deadline.abort()
    }, this.timeoutMs)
    const combined = AbortSignal.any([signal, this.lifetime.signal, deadline.signal])
    try {
      combined.throwIfAborted()
      yield { status: 'starting' }
      const executable = await this.ctx.subprocess.resolveExecutable(this.executable, undefined, combined)
      combined.throwIfAborted()
      const child = this.ctx.subprocess.spawn({
        argv: [executable, 'auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web'],
        cwd,
        stdio: { stdin: { data: '\n' }, stdout: { maxBytes: 16_384 }, stderr: { maxBytes: 16_384 } },
        graceMs: this.graceMs,
        signal: combined,
        // The UI opens the fixed device URL. Do not make the browser a child of this managed process.
        env: {
          GH_PROMPT_DISABLED: '1',
          GH_BROWSER: process.platform === 'win32' ? 'cmd /c exit 0' : 'true',
          GH_HOST: 'github.com',
        },
      })
      attempt.child = child
      const progress = { ended: false }
      const stdout = child.collected.stdout,
        stderr = child.collected.stderr
      if (!stdout || !stderr) throw new Error('GitHub login output collection is unavailable')
      const cancelled = () => combined.aborted
      const ended = () => progress.ended
      const outcome = child.done.then(
        (value) => {
          progress.ended = true
          return value
        },
        (error: unknown) => {
          progress.ended = true
          throw error
        },
      )
      void outcome.catch(() => {
        /* Rejection is consumed by the awaited outcome below. */
      })
      let lastCode = ''
      while (!ended() && !cancelled()) {
        const output = `${stdout.readFrom(0).text}\n${stderr.readFrom(0).text}`.replace(/\x1b\[[0-9;]*m/g, '')
        const code = /one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i.exec(output)?.[1]
        if (code && code !== lastCode) {
          lastCode = code
          yield { status: 'waiting', code, url: 'https://github.com/login/device' }
        }
        if (!ended()) {
          try {
            await delay(150, undefined, { signal: combined })
          } catch (error) {
            if (!cancelled()) throw error
          }
        }
      }
      const result = await outcome
      if (signal.aborted || this.lifetime.signal.aborted) return
      yield deadline.signal.aborted
        ? { status: 'failed', reason: 'timeout' }
        : result.exitCode === 0
          ? { status: 'complete' }
          : { status: 'failed', reason: 'login-failed' }
    } finally {
      clearTimeout(timer)
      try {
        if (attempt.child) {
          attempt.child.terminate()
          await attempt.child.done.catch(() => {
            /* The caller owns failure reporting; cleanup still joins the range. */
          })
          await attempt.child.waitForExit()
        }
      } finally {
        if (this.attempt === attempt) this.attempt = undefined
      }
    }
  }
}
