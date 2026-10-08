# 开发工作流接口

[English](developer-workflows.md) | 中文

本页记录本地 Git、只读代码审查和保存的 SSH 连接所使用的类型。具体操作、权限和限制分别由各控制器的 README 负责。

## GitWorkspace

```ts type-equiv
/** Registered project that can be inspected for a Git repository. */
interface GitWorkspace {
  id: WorkspaceId
  title: string
  path: string
}
```

## GitChange

```ts type-equiv
/** One path from NUL-delimited Git porcelain output. */
interface GitChange {
  path: string
  originalPath?: string
  index: string
  worktree: string
  conflict: boolean
}
```

## GitStatus

```ts type-equiv
/** Repository status and optimistic mutation fence. */
interface GitStatus {
  root: string
  branch: string | null
  head: string | null
  upstream: string | null
  ahead: number
  behind: number
  merging: boolean
  revision: string
  changes: GitChange[]
}
```

## GitBranch

```ts type-equiv
/** Local branch displayed in the branch selector. */
interface GitBranch {
  name: string
  current: boolean
  head: string
}
```

## GitCommit

```ts type-equiv
/** One immutable commit in the history list. */
interface GitCommit {
  hash: string
  subject: string
  author: string
  timestamp: number
}
```

## GitDiff

```ts type-equiv
/** Bounded diff; truncation is explicit instead of silently dropping its beginning. */
interface GitDiff {
  text: string
  truncated: boolean
  untracked: boolean
}
```

## GitCommandResult

```ts type-equiv
/** Completed command result. A timeout or signal is never success. */
interface GitCommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  truncated: boolean
}
```

## GitMutation

```ts type-equiv
/** Result after a mutation with a fresh repository status. */
interface GitMutation {
  result: GitCommandResult
  status: GitStatus
}
```

## GitPreferences

```ts type-equiv
/** Persisted Git preferences used by corresponding operations. */
interface GitPreferences {
  branchPrefix: string
  draftPullRequests: boolean
  mergeMethod: 'merge' | 'squash'
}
```

## GithubAccount

```ts type-equiv
/** Display-safe GitHub account state; no credential value crosses Remote. */
interface GithubAccount {
  available: boolean
  login: string | null
  authenticated: boolean
}
```

## GitPullRequest

```ts type-equiv
/** A pull request in the repository selected by the workspace. */
interface GitPullRequest {
  number: number
  title: string
  url: string
  headRefName: string
  baseRefName: string
  isDraft: boolean
  state: string
  headRefOid: string
}
```

## GithubLoginState

```ts type-equiv
/** Device-code sign-in progress, containing no access token or raw command output. */
type GithubLoginState =
  | { status: 'starting' }
  | { status: 'waiting'; code: string; url: string }
  | { status: 'complete' }
  | { status: 'failed'; reason: 'timeout' | 'login-failed' }
```

## GitReviewTarget

```ts type-equiv
/** Explicit local or pull-request comparison selected for source review. */
type GitReviewTarget = { kind: 'working' } | { kind: 'branch'; base: string } | { kind: 'pull-request'; number: number }
```

## GitReviewContext

```ts type-equiv
/** Bounded repository facts captured before the reviewer starts. */
interface GitReviewContext {
  root: string
  head: string | null
  base: string | null
  revision: string
  files: string[]
  diff: string
  truncated: boolean
  target: GitReviewTarget
}
```

## ReviewRepositoryPreferences

```ts type-equiv
/** Persistent reviewer model selection and additional review instructions. */
interface ReviewRepositoryPreferences {
  /** Reviewer provider; empty follows the ordinary chat model. */
  provider: string
  /** Reviewer model paired with provider. */
  model: string
  /** Additional review criteria supplied by the user. */
  instructions: string
  /** Saved base branch or revision for branch comparisons. */
  base: string
  /** Saved review focus for this workspace. */
  focus: string
}
```

## ReviewPreferences

```ts type-equiv
/** Global defaults and saved per-workspace review choices. */
interface ReviewPreferences {
  /** Reviewer provider; empty follows the ordinary chat model. */
  provider: string
  /** Reviewer model paired with provider. */
  model: string
  /** Additional review criteria supplied by the user. */
  instructions: string
  /** Reviewer preferences keyed by registered workspace identity. */
  repositories: Record<string, ReviewRepositoryPreferences>
}
```

## ReviewRequest

```ts type-equiv
/** One user-authorized review attempt; keep its identity stable while retrying. */
interface ReviewRequest {
  requestId: string
  workspaceId: WorkspaceId
  target: GitReviewTarget
  /** Saved review focus for this workspace. */
  focus: string
  language?: 'zh' | 'en'
  preferences?: { provider: string; model: string; instructions: string }
}
```

## ReviewReceipt

```ts type-equiv
/** Acknowledgement that the review Session accepted its input, not a completed review. */
type ReviewReceipt =
  | { sessionId: SessionId; reused: true }
  | { sessionId: SessionId; reused: false; head: string | null; base: string | null; truncated: boolean }
```

## SshConnectionId

```ts type-equiv
/** Stable connection identity derived from a saved OpenSSH alias. */
type SshConnectionId = Branded<'SshConnectionId'>
```

## SshProfile

```ts type-equiv
/** User-owned bookmark; credential material stays in OpenSSH/its agent. */
interface SshProfile {
  /** Concrete OpenSSH Host alias used to resolve the server. */
  alias: string
  /** User-visible connection name. */
  label: string
  /** Saved remote POSIX directory; empty selects the account home. */
  directory: string
  /** Explicit permission to execute AI commands with this SSH account. */
  allowAgentCommands: boolean
}
```

## SavedSshConnection

```ts type-equiv
/** Connection row with an opaque identity and its discovery source. */
interface SavedSshConnection extends SshProfile {
  id: SshConnectionId
  saved: boolean
}
```

## ConnectionPreferences

```ts type-equiv
/** Saved overrides over discoverable OpenSSH aliases. */
interface ConnectionPreferences {
  profiles: Record<string, SshProfile>
}
```

## SshConnectionList

```ts type-equiv
/** Existing aliases plus nonfatal discovery diagnostics. */
interface SshConnectionList {
  connections: SavedSshConnection[]
  warnings: string[]
}
```

## SshProbe

```ts type-equiv
/** Successful authentication probe and display-safe resolved endpoint. */
interface SshProbe {
  connected: boolean
  host: string
  user: string
  port: number
  message: string
}
```

## SshCommandResult

```ts type-equiv
/** Settled local SSH process; timeout does not prove the remote command stopped. */
interface SshCommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  truncated: boolean
}
```

## SshSessionReceipt

```ts type-equiv
/** Dedicated local control Session and an optional user terminal on the remote host. */
interface SshSessionReceipt {
  sessionId: SessionId
  terminalId?: WebTerminalId
}
```

## 关联模块

- [Git](../../packages/api/git-controller/README.zh.md)
- [代码审查](../../packages/api/code-review-controller/README.zh.md)
- [SSH](../../packages/api/connection-controller/README.zh.md)

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcodereviewcontroller--codereviewcontroller"></a>

### `ctx.codeReviewController` — `CodeReviewController`

Start ordinary, inspectable review Sessions without publishing GitHub reviews.

```ts cordis-catalog
/**
 * Read the dedicated review model preferences without changing ordinary chat defaults.
 * @returns stored strings; empty provider/model follow the current default selection.
 */
@Remote preferences(): ReviewPreferences

/**
 * Prepare and admit one review; repeated in-flight requests share the same attempt.
 * @param request - user-selected comparison, optional focus and stable request identity.
 * @param signal - cancellation before prompt admission.
 * @returns the review Session and captured comparison commits.
 */
@Remote start(request: ReviewRequest, signal: AbortSignal): Promise<ReviewReceipt>
```

Source: [`packages/api/code-review-controller/src/index.ts`](../../packages/api/code-review-controller/src/index.ts)

<a id="ctxconnectioncontroller--connectioncontroller"></a>

### `ctx.connectionController` — `ConnectionController`

Connection control; every command uses a resolved OpenSSH target and never falls back locally.

```ts cordis-catalog
/**
 * Discover concrete Host aliases and overlay saved user preferences.
 * @returns connection rows without private keys, passwords or raw SSH configuration.
 */
@Remote async list(): Promise<SshConnectionList>

/**
 * Read bookmark preferences for the settings page.
 * @returns detached aliases, labels and explicit remote-command grants.
 */
@Remote preferences(): ConnectionPreferences

/**
 * Check authentication using a fixed read-only command and existing known-host trust.
 * @param id - discovered or saved connection identity.
 * @param signal - caller cancellation.
 * @returns authentication outcome and the resolved endpoint, never a private key.
 */
@Remote async test(id: SshConnectionId, signal: AbortSignal): Promise<SshProbe>

/**
 * Create a dedicated local control conversation and optionally open its remote terminal.
 * @param id - connection selected by the user.
 * @param requestId - stable identity for retrying the same connection action.
 * @param terminal - open an interactive SSH terminal after Session creation.
 * @param signal - preparation cancellation.
 * @returns Session and optional terminal identities.
 */
@Remote start(id: SshConnectionId, requestId: string, terminal: boolean, signal: AbortSignal): Promise<SshSessionReceipt>

/**
 * Run a command only for the initiating SSH Session and its explicitly enabled target.
 * @param agent - exact live Agent supplied by tool execution.
 * @param command - POSIX command deliberately requested for this server.
 * @param signal - tool cancellation.
 * @returns bounded output; remote process state is unknown after timeout/disconnect.
 */
async execute(agent: Agent, command: string, signal: AbortSignal): Promise<SshCommandResult>
```

Types: [Agent](core.zh.md)

Source: [`packages/api/connection-controller/src/index.ts`](../../packages/api/connection-controller/src/index.ts)

<a id="ctxgitcontroller--gitcontroller"></a>

### `ctx.gitController` — `GitController`

Serialized repository mutations with optimistic state checks.

```ts cordis-catalog
/**
 * List registered local project choices without probing every repository.
 * @returns stable identities and user-visible workspace labels.
 */
@Remote workspaces(): GitWorkspace[]

/**
 * Read the current preferences applied by branch and PR operations.
 * @returns a detached settings projection.
 */
@Remote preferences(): GitPreferences

/**
 * Inspect a selected workspace repository, including staged and unstaged changes.
 * @param id - registered workspace identity.
 * @returns complete status with a mutation revision.
 */
@Remote async status(id: WorkspaceId): Promise<GitStatus>

/**
 * List recent commits from the current branch, including an unborn repository.
 * @param id - registered workspace identity.
 * @returns newest commits first, bounded to 100 entries.
 */
@Remote async history(id: WorkspaceId): Promise<GitCommit[]>

/**
 * List local branches for an explicit branch switch.
 * @param id - registered workspace identity.
 * @returns branch names, commit identities and the current marker.
 */
@Remote async branches(id: WorkspaceId): Promise<GitBranch[]>

/**
 * Read a single changed file diff without invoking external diff commands.
 * @param id - registered workspace identity.
 * @param path - repository-relative file selected in status.
 * @param staged - whether to inspect the index instead of the working tree.
 * @returns text and an explicit truncation flag.
 */
@Remote async diff(id: WorkspaceId, path: string, staged: boolean): Promise<GitDiff>

/**
 * Stage selected paths together; no implicit stage-all occurs before commit.
 * @param id - registered workspace identity.
 * @param paths - explicitly selected relative file paths.
 * @param revision - status revision seen by the user.
 * @returns command outcome and refreshed status.
 */
@Remote async stage(id: WorkspaceId, paths: string[], revision: string): Promise<GitMutation>

/**
 * Remove selected changes from the index without changing working files.
 * @param id - registered workspace identity.
 * @param paths - explicitly selected relative file paths.
 * @param revision - status revision seen by the user.
 * @returns command outcome and refreshed status.
 */
@Remote async unstage(id: WorkspaceId, paths: string[], revision: string): Promise<GitMutation>

/**
 * Commit the exact index reviewed by the user; never stages or amends implicitly.
 * @param id - registered workspace identity.
 * @param message - commit message supplied by the user.
 * @param revision - expected index and HEAD revision.
 * @returns command outcome and refreshed status.
 */
@Remote async commit(id: WorkspaceId, message: string, revision: string): Promise<GitMutation>

/**
 * Switch branches without discarding changes, optionally using the saved creation prefix.
 * @param id - registered workspace identity.
 * @param name - existing branch name or new branch suffix.
 * @param create - create the prefixed branch before switching.
 * @param revision - expected repository revision.
 * @returns command outcome and refreshed status.
 */
@Remote async switchBranch(id: WorkspaceId, name: string, create: boolean, revision: string): Promise<GitMutation>

/**
 * Fetch, fast-forward pull, or push the current branch to its configured upstream.
 * @param id - registered workspace identity.
 * @param action - explicit user action; no force push or automatic merge.
 * @param revision - expected repository revision.
 * @returns command outcome and refreshed status.
 */
@Remote async network(id: WorkspaceId, action: 'fetch' | 'pull' | 'push', revision: string): Promise<GitMutation>

/**
 * Read GitHub authentication status without requesting or returning access tokens.
 * @param id - registered workspace identity used for command execution.
 * @returns active GitHub account when available.
 */
@Remote async githubAccount(id: WorkspaceId): Promise<GithubAccount>

/**
 * Authorize GitHub through the browser without sending tokens to the renderer.
 * @param id - registered workspace identity.
 * @param signal - sign-in dialog lifetime; cancellation terminates the login command.
 * @returns safe device-code progress.
 */
@Remote({ mode: 'stream' }) async *loginGithub(id: WorkspaceId, signal: AbortSignal): AsyncIterable<GithubLoginState>

/**
 * List open pull requests associated with the selected repository.
 * @param id - registered workspace identity.
 * @returns bounded PR metadata without fetching or changing branches.
 */
@Remote async pullRequests(id: WorkspaceId): Promise<GitPullRequest[]>

/**
 * Create a PR for an already published branch using the saved draft preference.
 * @param id - registered workspace identity.
 * @param title - reviewed pull-request title.
 * @param body - reviewed pull-request description.
 * @param base - destination branch explicitly selected by the user.
 * @param revision - repository state reviewed before publication.
 * @returns command outcome containing the created PR URL and refreshed status.
 */
@Remote async createPullRequest(id: WorkspaceId, title: string, body: string, base: string, revision: string): Promise<GitMutation>

/**
 * Merge the reviewed PR commit immediately, without enabling automatic merge or bypassing rules.
 * @param id - registered workspace identity.
 * @param number - selected pull-request number.
 * @param head - exact PR head commit reviewed by the user.
 * @returns GitHub's merge result; a refusal is an error, never a deferred auto-merge.
 */
@Remote async mergePullRequest(id: WorkspaceId, number: number, head: string): Promise<string>

/**
 * Check out a selected PR without forcing away local changes.
 * @param id - registered workspace identity.
 * @param number - selected PR number.
 * @param revision - repository state seen before switching.
 * @returns command outcome and the actual resulting HEAD/status.
 */
@Remote async checkoutPullRequest(id: WorkspaceId, number: number, revision: string): Promise<GitMutation>

/**
 * Capture a bounded diff and exact comparison identities for the reviewer.
 * @param id - registered workspace identity.
 * @param target - local changes, a base branch, or a checked-out PR.
 * @param signal - caller cancellation while preparing the comparison.
 * @returns captured diff, paths and revision; HEAD/index/status transitions are checked again before return.
 */
@Remote async reviewContext(id: WorkspaceId, target: GitReviewTarget, signal: AbortSignal): Promise<GitReviewContext>
```

Types: [WorkspaceId](workspace.zh.md)

Source: [`packages/api/git-controller/src/index.ts`](../../packages/api/git-controller/src/index.ts)
<!-- END GENERATED cordis-surface -->
