/** Bounded, shell-free Git/GitHub subprocesses owned by the plugin lifetime. */
import type { Context } from '@deepseek-ai/cordis'
import { SubprocessExecutableNotFoundError } from '@deepseek-ai/dsh-subprocess'
import type { GitCommandResult } from './types.ts'

/** Host-configured executable and resource limits. */
export interface CommandConfig {
  /** Git executable path or PATH name. */
  gitExecutable: string
  /** GitHub CLI executable path or PATH name. */
  githubExecutable: string
  /** Maximum duration of one Git or GitHub CLI operation. */
  timeoutMs: number
  /** Maximum retained bytes for each output stream. */
  maxOutputBytes: number
  /** Managed process termination grace period in milliseconds. */
  graceMs: number
}

/**
 * Quote a resolved GitHub CLI path for Git's POSIX credential-helper shell.
 * @param executable - verified executable path, including Windows paths with spaces.
 * @returns Git helper command; credentials flow directly between Git and gh.
 */
export function githubCredentialHelper(executable: string): string {
  const quoted = `'${executable.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`
  return `!${quoted} auth git-credential`
}

/** Managed command runner; disposal aborts and awaits every active command. */
export class GitCommands {
  private readonly lifetime = new AbortController()
  private readonly active = new Set<Promise<GitCommandResult>>()
  constructor(
    private readonly ctx: Context,
    private readonly config: CommandConfig,
  ) {
    ctx.effect(
      () => async () => {
        this.lifetime.abort()
        await Promise.allSettled([...this.active])
      },
      'git-controller: command lifetime',
    )
  }

  /**
   * Execute arguments directly, never through a shell or interpolated command.
   * @param program - configured executable family.
   * @param cwd - Host-resolved repository directory.
   * @param args - distinct argument strings.
   * @param input - optional standard-input text.
   * @param requestSignal - optional caller cancellation in addition to Host lifetime.
   * @returns bounded outputs and independent timeout/exit facts.
   */
  run(
    program: 'git' | 'gh',
    cwd: string,
    args: readonly string[],
    input?: string,
    requestSignal?: AbortSignal,
  ): Promise<GitCommandResult> {
    const operation = this.execute(program, cwd, args, input, requestSignal)
    this.active.add(operation)
    void operation.then(
      () => this.active.delete(operation),
      () => this.active.delete(operation),
    )
    return operation
  }

  private async execute(
    program: 'git' | 'gh',
    cwd: string,
    args: readonly string[],
    input?: string,
    requestSignal?: AbortSignal,
  ): Promise<GitCommandResult> {
    this.lifetime.signal.throwIfAborted()
    const deadline = new AbortController()
    const timer = setTimeout(() => {
      deadline.abort()
    }, this.config.timeoutMs)
    const signal = AbortSignal.any([this.lifetime.signal, deadline.signal, ...(requestSignal ? [requestSignal] : [])])
    try {
      const executable = await this.ctx.subprocess.resolveExecutable(
        program === 'git' ? this.config.gitExecutable : this.config.githubExecutable,
        undefined,
        signal,
      )
      const credentials: string[] = []
      if (program === 'git' && ['fetch', 'pull', 'push'].includes(args[0] ?? '')) {
        try {
          const gh = await this.ctx.subprocess.resolveExecutable(this.config.githubExecutable, undefined, signal)
          credentials.push('-c', `credential.https://github.com.helper=${githubCredentialHelper(gh)}`)
        } catch (error) {
          // Git remains usable with its existing credential helpers when gh is not installed.
          if (!(error instanceof SubprocessExecutableNotFoundError)) throw error
        }
      }
      const child = this.ctx.subprocess.spawn({
        argv: [
          executable,
          ...(program === 'git' ? ['--no-pager', '--literal-pathspecs', '-c', 'color.ui=false', ...credentials] : []),
          ...args,
        ],
        cwd,
        stdio: {
          stdin: input === undefined ? 'ignore' : { data: input },
          stdout: { maxBytes: this.config.maxOutputBytes },
          stderr: { maxBytes: this.config.maxOutputBytes },
        },
        graceMs: this.config.graceMs,
        signal,
        env: {
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'never',
          GH_PROMPT_DISABLED: '1',
          GH_PAGER: 'cat',
          GIT_PAGER: 'cat',
          GIT_OPTIONAL_LOCKS: '0',
          LC_ALL: 'C',
          GIT_DIR: undefined,
          GIT_WORK_TREE: undefined,
          GIT_INDEX_FILE: undefined,
          GIT_OBJECT_DIRECTORY: undefined,
          GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
          GIT_CONFIG_COUNT: undefined,
        },
      })
      const outcome = await child.done
      if (signal.aborted) await child.waitForExit()
      const stdoutReader = child.collected.stdout,
        stderrReader = child.collected.stderr
      if (!stdoutReader || !stderrReader) throw new Error('Command output collection is unavailable')
      const stdout = stdoutReader.readFrom(0)
      const stderr = stderrReader.readFrom(0)
      if (this.lifetime.signal.aborted) throw new Error('Git controller is shutting down')
      requestSignal?.throwIfAborted()
      return {
        stdout: stdout.text,
        stderr: stderr.text,
        exitCode: outcome.exitCode,
        timedOut: deadline.signal.aborted,
        truncated: stdout.lossy || stderr.lossy,
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * Require complete successful command output before parsing it as repository state.
 * @param result - settled command outcome.
 * @returns stdout when the command completed successfully without truncation.
 */
export function completeOutput(result: GitCommandResult): string {
  if (result.timedOut) throw new Error('Git operation timed out; refresh before retrying')
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || 'Git operation did not complete')
  if (result.truncated) throw new Error('Git output exceeded the configured size limit')
  return result.stdout
}
