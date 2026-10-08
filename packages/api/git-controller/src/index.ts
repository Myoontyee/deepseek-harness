/** Workspace-scoped Git commands for authenticated application clients. */
import { createHash } from 'node:crypto'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as json } from 'zod'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-settings'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { GitCommands, completeOutput, type CommandConfig } from './commands.ts'
import { GithubSignIn } from './auth.ts'
import { literalPath, parseStatus } from './parse.ts'
import type {
  GitBranch,
  GitCommit,
  GitDiff,
  GitMutation,
  GitPreferences,
  GitPullRequest,
  GitStatus,
  GitWorkspace,
  GithubAccount,
  GithubLoginState,
  GitReviewContext,
  GitReviewTarget,
} from './types.ts'

export type * from './types.ts'

/** Executable limits and persistent workflow preferences. */
export interface Config extends CommandConfig {
  /** Maximum duration of a user-authorized browser login. */
  loginTimeoutMs: number
  /** Prefix used when creating a branch from the Git page. */
  branchPrefix: Volatile<string>
  /** Whether new pull requests are drafts by default. */
  draftPullRequests: Volatile<boolean>
  /** User-selected immediate pull request merge method. */
  mergeMethod: Volatile<'merge' | 'squash'>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Git and GitHub operations bound to registered workspaces. */ gitController: GitController
  }
}

/** Serialized repository mutations with optimistic state checks. */
export class GitController extends TypertRemoteService {
  static inject = ['typert', 'workspaceRegistry', 'subprocess']
  static Config = z.object({
    gitExecutable: z.string().min(1).default('git'),
    githubExecutable: z.string().min(1).default('gh'),
    loginTimeoutMs: z.number().step(1).min(1000).max(2_147_483_647).default(600_000),
    timeoutMs: z.number().step(1).min(1).max(2_147_483_647).default(60_000),
    maxOutputBytes: z
      .number()
      .step(1)
      .min(1024)
      .default(2 * 1024 * 1024),
    graceMs: z.number().step(1).min(1).max(2_147_483_647).default(1000),
    branchPrefix: z.string().default('dsh/').volatile(),
    draftPullRequests: z.boolean().default(true).volatile(),
    mergeMethod: z
      .union([z.const('merge'), z.const('squash')])
      .default('squash')
      .volatile(),
  })
  private readonly signIn: GithubSignIn
  private readonly commands: GitCommands
  private readonly mutations = new Map<string, Promise<void>>()
  constructor(
    ctx: Context,
    private readonly config: Config,
  ) {
    super(ctx, 'gitController', { namespace: 'git' })
    this.commands = new GitCommands(ctx, config)
    this.signIn = new GithubSignIn(ctx, config.githubExecutable, config.loginTimeoutMs, config.graceMs)
    ctx.inject(['settings'], (child) => {
      child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
    })
  }

  /**
   * List registered local project choices without probing every repository.
   * @returns stable identities and user-visible workspace labels.
   */
  @Remote
  workspaces(): GitWorkspace[] {
    return this.ctx.workspaceRegistry.list().map(({ id, title, path }) => ({ id, title, path }))
  }

  /**
   * Read the current preferences applied by branch and PR operations.
   * @returns a detached settings projection.
   */
  @Remote
  preferences(): GitPreferences {
    return {
      branchPrefix: this.config.branchPrefix.get(),
      draftPullRequests: this.config.draftPullRequests.get(),
      mergeMethod: this.config.mergeMethod.get(),
    }
  }

  /**
   * Inspect a selected workspace repository, including staged and unstaged changes.
   * @param id - registered workspace identity.
   * @returns complete status with a mutation revision.
   */
  @Remote
  async status(id: WorkspaceId): Promise<GitStatus> {
    return this.readStatus(await this.repository(id))
  }

  /**
   * List recent commits from the current branch, including an unborn repository.
   * @param id - registered workspace identity.
   * @returns newest commits first, bounded to 100 entries.
   */
  @Remote
  async history(id: WorkspaceId): Promise<GitCommit[]> {
    const root = await this.repository(id)
    if ((await this.readStatus(root)).head === null) return []
    const text = completeOutput(await this.commands.run('git', root, ['log', '-100', '--format=%H%x00%s%x00%an%x00%at%x00']))
    const values = text.split('\0')
    const commits: GitCommit[] = []
    for (let i = 0; i + 3 < values.length; i += 4) {
      const [rawHash, subject, author, timestamp] = values.slice(i, i + 4)
      if (rawHash === undefined || subject === undefined || author === undefined || timestamp === undefined)
        throw new Error('Invalid Git log record')
      const hash = rawHash.trim()
      if (!/^[a-f0-9]{40,64}$/.test(hash)) throw new Error('Git returned an invalid commit identity')
      commits.push({ hash, subject, author, timestamp: Number(timestamp) })
    }
    return commits
  }

  /**
   * List local branches for an explicit branch switch.
   * @param id - registered workspace identity.
   * @returns branch names, commit identities and the current marker.
   */
  @Remote
  async branches(id: WorkspaceId): Promise<GitBranch[]> {
    const root = await this.repository(id)
    const output = completeOutput(
      await this.commands.run('git', root, [
        'for-each-ref',
        '--format=%(refname:short)%00%(objectname)%00%(HEAD)',
        'refs/heads/',
      ]),
    )
    return output
      .trimEnd()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, head, current] = line.replace(/\r$/, '').split('\0')
        if (!name || !head) throw new Error('Git returned an invalid branch record')
        return { name, head, current: current === '*' }
      })
  }

  /**
   * Read a single changed file diff without invoking external diff commands.
   * @param id - registered workspace identity.
   * @param path - repository-relative file selected in status.
   * @param staged - whether to inspect the index instead of the working tree.
   * @returns text and an explicit truncation flag.
   */
  @Remote
  async diff(id: WorkspaceId, path: string, staged: boolean): Promise<GitDiff> {
    const root = await this.repository(id)
    const file = literalPath(path)
    const status = await this.readStatus(root)
    const entry = status.changes.find(change => change.path === file)
    if (!entry) throw new Error('The selected file has changed; refresh the repository')
    const args = ['diff', '--no-ext-diff', '--no-textconv', '--no-color', ...(staged ? ['--cached'] : []), '--', file]
    if (!staged && entry.index === '?' && entry.worktree === '?') {
      return { text: '', truncated: false, untracked: true }
    }
    const result = await this.commands.run('git', root, args)
    if (result.timedOut || result.exitCode !== 0) completeOutput(result)
    return { text: result.stdout, truncated: result.truncated, untracked: false }
  }

  /**
   * Stage selected paths together; no implicit stage-all occurs before commit.
   * @param id - registered workspace identity.
   * @param paths - explicitly selected relative file paths.
   * @param revision - status revision seen by the user.
   * @returns command outcome and refreshed status.
   */
  @Remote
  async stage(id: WorkspaceId, paths: string[], revision: string): Promise<GitMutation> {
    return this.mutate(id, revision, async (root, state) => {
      const selected = this.selectedPaths(paths, state)
      return this.commands.run('git', root, ['add', '--', ...selected])
    })
  }

  /**
   * Remove selected changes from the index without changing working files.
   * @param id - registered workspace identity.
   * @param paths - explicitly selected relative file paths.
   * @param revision - status revision seen by the user.
   * @returns command outcome and refreshed status.
   */
  @Remote
  async unstage(id: WorkspaceId, paths: string[], revision: string): Promise<GitMutation> {
    return this.mutate(id, revision, async (root, state) => {
      const selected = this.selectedPaths(paths, state)
      return this.commands.run(
        'git',
        root,
        state.head === null
          ? ['rm', '--cached', '--ignore-unmatch', '--', ...selected]
          : ['reset', '-q', 'HEAD', '--', ...selected],
      )
    })
  }

  /**
   * Commit the exact index reviewed by the user; never stages or amends implicitly.
   * @param id - registered workspace identity.
   * @param message - commit message supplied by the user.
   * @param revision - expected index and HEAD revision.
   * @returns command outcome and refreshed status.
   */
  @Remote
  async commit(id: WorkspaceId, message: string, revision: string): Promise<GitMutation> {
    if (!message.trim() || message.length > 100_000 || message.includes('\0')) throw new Error('Enter a commit message')
    return this.mutate(id, revision, root => this.commands.run('git', root, ['commit', '--file=-'], message))
  }

  /**
   * Switch branches without discarding changes, optionally using the saved creation prefix.
   * @param id - registered workspace identity.
   * @param name - existing branch name or new branch suffix.
   * @param create - create the prefixed branch before switching.
   * @param revision - expected repository revision.
   * @returns command outcome and refreshed status.
   */
  @Remote
  async switchBranch(id: WorkspaceId, name: string, create: boolean, revision: string): Promise<GitMutation> {
    return this.mutate(id, revision, async (root) => {
      const branch = create ? this.config.branchPrefix.get() + name : name
      if (!branch || branch.startsWith('-') || /[\0\r\n]/.test(branch)) throw new Error('Enter a valid branch name')
      completeOutput(await this.commands.run('git', root, ['check-ref-format', '--branch', branch]))
      return this.commands.run('git', root, ['switch', ...(create ? ['-c'] : []), branch])
    })
  }

  /**
   * Fetch, fast-forward pull, or push the current branch to its configured upstream.
   * @param id - registered workspace identity.
   * @param action - explicit user action; no force push or automatic merge.
   * @param revision - expected repository revision.
   * @returns command outcome and refreshed status.
   */
  @Remote
  async network(id: WorkspaceId, action: 'fetch' | 'pull' | 'push', revision: string): Promise<GitMutation> {
    return this.mutate(id, revision, async (root, state) => {
      if (action === 'pull' && !state.branch) throw new Error('Select a branch before pulling or pushing')
      if (action === 'pull' && !state.upstream) throw new Error('Configure an upstream branch before pulling')
      if (action === 'push' && !state.upstream) {
        if (!state.branch) throw new Error('Select a branch before pushing')
        const remotes = completeOutput(await this.commands.run('git', root, ['remote'])).split(/\r?\n/)
        if (!remotes.includes('origin')) throw new Error('Configure the origin remote before publishing this branch')
        return this.commands.run('git', root, ['push', '--set-upstream', 'origin', state.branch])
      }
      return this.commands.run('git', root, action === 'pull' ? ['pull', '--ff-only'] : [action])
    })
  }

  /**
   * Read GitHub authentication status without requesting or returning access tokens.
   * @param id - registered workspace identity used for command execution.
   * @returns active GitHub account when available.
   */
  @Remote
  async githubAccount(id: WorkspaceId): Promise<GithubAccount> {
    const root = await this.repository(id)
    let result
    try {
      result = await this.commands.run('gh', root, ['auth', 'status', '--active', '--hostname', 'github.com', '--json', 'hosts'])
    } catch (error) {
      if (error instanceof Error && /not found|ENOENT|executable/i.test(error.message))
        return { available: false, authenticated: false, login: null }
      throw error
    }
    if (result.timedOut || result.truncated || result.exitCode !== 0) completeOutput(result)
    const schema = json.object({
      hosts: json.record(
        json.string(),
        json.array(
          json.object({ login: json.string().optional(), state: json.string().optional(), active: json.boolean().optional() }),
        ),
      ),
    })
    const data = schema.parse(JSON.parse(result.stdout))
    const account = data.hosts['github.com']?.find(entry => entry.active && entry.state === 'success')
    return { available: true, authenticated: account !== undefined, login: account?.login ?? null }
  }

  /**
   * Authorize GitHub through the browser without sending tokens to the renderer.
   * @param id - registered workspace identity.
   * @param signal - sign-in dialog lifetime; cancellation terminates the login command.
   * @returns safe device-code progress.
   */
  @Remote({ mode: 'stream' })
  async *loginGithub(id: WorkspaceId, signal: AbortSignal): AsyncIterable<GithubLoginState> {
    const root = await this.repository(id)
    yield* this.signIn.login(root, signal)
  }

  /**
   * List open pull requests associated with the selected repository.
   * @param id - registered workspace identity.
   * @returns bounded PR metadata without fetching or changing branches.
   */
  @Remote
  async pullRequests(id: WorkspaceId): Promise<GitPullRequest[]> {
    const root = await this.repository(id)
    const output = completeOutput(
      await this.commands.run('gh', root, [
        'pr',
        'list',
        '--limit',
        '30',
        '--json',
        'number,title,url,headRefName,baseRefName,isDraft,state,headRefOid',
      ]),
    )
    return json
      .array(
        json.object({
          number: json.number().int().positive(),
          title: json.string(),
          url: json.url(),
          headRefName: json.string(),
          baseRefName: json.string(),
          isDraft: json.boolean(),
          state: json.string(),
          headRefOid: json.string(),
        }),
      )
      .parse(JSON.parse(output))
  }

  /**
   * Create a PR for an already published branch using the saved draft preference.
   * @param id - registered workspace identity.
   * @param title - reviewed pull-request title.
   * @param body - reviewed pull-request description.
   * @param base - destination branch explicitly selected by the user.
   * @param revision - repository state reviewed before publication.
   * @returns command outcome containing the created PR URL and refreshed status.
   */
  @Remote
  async createPullRequest(id: WorkspaceId, title: string, body: string, base: string, revision: string): Promise<GitMutation> {
    if (!title.trim() || title.length > 256 || body.length > 100_000 || /[\0\r\n]/.test(title) || body.includes('\0'))
      throw new Error('Enter a valid pull request title and description')
    return this.mutate(id, revision, async (root, state) => {
      if (!state.branch || !state.upstream) throw new Error('Publish the branch before creating a pull request')
      if (!base || base.startsWith('-') || /[\0\r\n]/.test(base)) throw new Error('Select a base branch')
      completeOutput(await this.commands.run('git', root, ['check-ref-format', '--branch', base]))
      return this.commands.run(
        'gh',
        root,
        [
          'pr',
          'create',
          '--title',
          title,
          '--body-file',
          '-',
          '--base',
          base,
          '--head',
          state.branch,
          ...(this.config.draftPullRequests.get() ? ['--draft'] : []),
        ],
        body,
      )
    })
  }

  /**
   * Merge the reviewed PR commit immediately, without enabling automatic merge or bypassing rules.
   * @param id - registered workspace identity.
   * @param number - selected pull-request number.
   * @param head - exact PR head commit reviewed by the user.
   * @returns GitHub's merge result; a refusal is an error, never a deferred auto-merge.
   */
  @Remote
  async mergePullRequest(id: WorkspaceId, number: number, head: string): Promise<string> {
    if (!Number.isSafeInteger(number) || number < 1 || !/^[a-f0-9]{40,64}$/i.test(head))
      throw new Error('Refresh the selected pull request')
    const root = await this.repository(id)
    const info = json
      .object({ nameWithOwner: json.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/) })
      .parse(JSON.parse(completeOutput(await this.commands.run('gh', root, ['repo', 'view', '--json', 'nameWithOwner']))))
    const output = completeOutput(
      await this.commands.run('gh', root, [
        'api',
        '--method',
        'PUT',
        `repos/${info.nameWithOwner}/pulls/${number}/merge`,
        '-f',
        `sha=${head}`,
        '-f',
        `merge_method=${this.config.mergeMethod.get()}`,
      ]),
    )
    const result = json
      .object({ merged: json.boolean(), message: json.string(), sha: json.string().optional() })
      .parse(JSON.parse(output))
    if (!result.merged) throw new Error(result.message)
    return result.sha ?? head
  }

  /**
   * Check out a selected PR without forcing away local changes.
   * @param id - registered workspace identity.
   * @param number - selected PR number.
   * @param revision - repository state seen before switching.
   * @returns command outcome and the actual resulting HEAD/status.
   */
  @Remote
  async checkoutPullRequest(id: WorkspaceId, number: number, revision: string): Promise<GitMutation> {
    if (!Number.isSafeInteger(number) || number < 1) throw new Error('Select a pull request')
    return this.mutate(id, revision, root => this.commands.run('gh', root, ['pr', 'checkout', String(number), '--detach']))
  }

  /**
   * Capture a bounded diff and exact comparison identities for the reviewer.
   * @param id - registered workspace identity.
   * @param target - local changes, a base branch, or a checked-out PR.
   * @param signal - caller cancellation while preparing the comparison.
   * @returns captured diff, paths and revision; HEAD/index/status transitions are checked again before return.
   */
  @Remote
  async reviewContext(id: WorkspaceId, target: GitReviewTarget, signal: AbortSignal): Promise<GitReviewContext> {
    const root = await this.repository(id, signal)
    const state = await this.readStatus(root, signal)
    let base: string | null = state.head
    let files = state.changes.map(change => change.path)
    let diff
    if (target.kind === 'pull-request') {
      if (!Number.isSafeInteger(target.number) || target.number < 1) throw new Error('Select a pull request')
      const pr = json
        .object({ headRefOid: json.string(), baseRefOid: json.string(), files: json.array(json.object({ path: json.string() })) })
        .parse(
          JSON.parse(
            completeOutput(
              await this.commands.run(
                'gh',
                root,
                ['pr', 'view', String(target.number), '--json', 'headRefOid,baseRefOid,files'],
                undefined,
                signal,
              ),
            ),
          ),
        )
      if (state.head !== pr.headRefOid || state.changes.length !== 0)
        throw new Error('Check out the PR commit and keep the working tree clean before reviewing it')
      base = pr.baseRefOid
      files = pr.files.map(file => file.path)
      diff = await this.commands.run('gh', root, ['pr', 'diff', String(target.number), '--patch'], undefined, signal)
      const verified = json
        .object({ headRefOid: json.string(), baseRefOid: json.string() })
        .parse(
          JSON.parse(
            completeOutput(
              await this.commands.run(
                'gh',
                root,
                ['pr', 'view', String(target.number), '--json', 'headRefOid,baseRefOid'],
                undefined,
                signal,
              ),
            ),
          ),
        )
      if (verified.headRefOid !== state.head || verified.baseRefOid !== base)
        throw new Error('The pull request changed; refresh before reviewing it')
    } else {
      let comparison: string[]
      if (target.kind === 'branch') {
        if (!state.head || !target.base || target.base.startsWith('-') || /[\0\r\n]/.test(target.base))
          throw new Error('Select a valid base branch')
        base = completeOutput(
          await this.commands.run(
            'git',
            root,
            ['rev-parse', '--verify', '--end-of-options', `${target.base}^{commit}`],
            undefined,
            signal,
          ),
        ).trim()
        if (!/^[a-f0-9]{40,64}$/i.test(base)) throw new Error('Git returned an invalid base commit')
        if (state.changes.length !== 0) throw new Error('Commit or stash local changes before reviewing a branch comparison')
        comparison = [`${base}...${state.head}`]
        files = completeOutput(
          await this.commands.run('git', root, ['diff', '--name-only', '-z', ...comparison, '--'], undefined, signal),
        )
          .split('\0')
          .filter(Boolean)
      } else comparison = state.head ? [state.head] : ['--cached']
      diff = await this.commands.run(
        'git',
        root,
        ['diff', '--no-ext-diff', '--no-textconv', '--no-color', ...comparison, '--'],
        undefined,
        signal,
      )
    }
    if (diff.timedOut || diff.exitCode !== 0) completeOutput(diff)
    if ((await this.readStatus(root, signal)).revision !== state.revision)
      throw new Error('The repository changed while preparing the review; refresh and retry')
    return { root, head: state.head, base, revision: state.revision, files, diff: diff.stdout, truncated: diff.truncated, target }
  }

  private async repository(id: WorkspaceId, signal?: AbortSignal): Promise<string> {
    const workspace = this.ctx.workspaceRegistry.get(id)
    if (!workspace) throw new Error('Workspace is no longer available')
    return completeOutput(
      await this.commands.run('git', workspace.path, ['rev-parse', '--show-toplevel'], undefined, signal),
    ).trimEnd()
  }

  private async readStatus(root: string, signal?: AbortSignal): Promise<GitStatus> {
    const [porcelain, headResult, indexResult, merge] = await Promise.all([
      this.commands.run(
        'git',
        root,
        ['status', '--porcelain=v1', '--branch', '-z', '--untracked-files=normal'],
        undefined,
        signal,
      ),
      this.commands.run('git', root, ['rev-parse', '--verify', '--quiet', 'HEAD'], undefined, signal),
      this.commands.run('git', root, ['ls-files', '--stage', '-z'], undefined, signal),
      this.commands.run('git', root, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], undefined, signal),
    ])
    const raw = completeOutput(porcelain)
    const unborn = /^## (?:No commits yet on |Initial commit on )/.test(raw)
    const head = unborn && headResult.exitCode === 1 && !headResult.timedOut ? null : completeOutput(headResult).trim()
    const index = completeOutput(indexResult)
    if (merge.timedOut || (merge.exitCode !== 0 && merge.exitCode !== 1)) completeOutput(merge)
    const revision = createHash('sha256')
      .update(JSON.stringify([head, raw, index]))
      .digest('hex')
    return { root, ...parseStatus(raw), head, merging: merge.exitCode === 0, revision }
  }

  private selectedPaths(paths: string[], state: GitStatus): string[] {
    if (paths.length === 0 || paths.length > 1000) throw new Error('Select between 1 and 1000 files')
    const selected = new Set<string>()
    for (const path of paths) {
      literalPath(path)
      const entry = state.changes.find(change => change.path === path)
      if (!entry) throw new Error('The selected files changed; refresh before trying again')
      selected.add(path)
      if (entry.originalPath) selected.add(literalPath(entry.originalPath))
    }
    return [...selected]
  }

  private async mutate(
    id: WorkspaceId,
    revision: string,
    run: (root: string, state: GitStatus) => ReturnType<GitCommands['run']>,
  ): Promise<GitMutation> {
    const root = await this.repository(id)
    const previous = this.mutations.get(root) ?? Promise.resolve()
    const operation = previous.then(async () => {
      const state = await this.readStatus(root)
      if (state.revision !== revision) throw new Error('Repository changed since the last refresh; review it before trying again')
      const result = await run(root, state)
      return { result, status: await this.readStatus(root) }
    })
    const settled = operation.then(
      () => undefined,
      () => undefined,
    )
    this.mutations.set(root, settled)
    void settled.then(() => {
      if (this.mutations.get(root) === settled) this.mutations.delete(root)
    })
    return operation
  }
}
export default GitController
