/** Structured Git results shared by the Host and its authenticated UI. */
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** Registered project that can be inspected for a Git repository. */
export interface GitWorkspace {
  id: WorkspaceId
  title: string
  path: string
}
/** One path from NUL-delimited Git porcelain output. */
export interface GitChange {
  path: string
  originalPath?: string
  index: string
  worktree: string
  conflict: boolean
}
/** Repository status and optimistic mutation fence. */
export interface GitStatus {
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
/** Local branch displayed in the branch selector. */
export interface GitBranch {
  name: string
  current: boolean
  head: string
}
/** One immutable commit in the history list. */
export interface GitCommit {
  hash: string
  subject: string
  author: string
  timestamp: number
}
/** Bounded diff; truncation is explicit instead of silently dropping its beginning. */
export interface GitDiff {
  text: string
  truncated: boolean
  untracked: boolean
}
/** Completed command result. A timeout or signal is never success. */
export interface GitCommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  truncated: boolean
}
/** Result after a mutation with a fresh repository status. */
export interface GitMutation {
  result: GitCommandResult
  status: GitStatus
}
/** Persisted Git preferences used by corresponding operations. */
export interface GitPreferences {
  branchPrefix: string
  draftPullRequests: boolean
  mergeMethod: 'merge' | 'squash'
}
/** Display-safe GitHub account state; no credential value crosses Remote. */
export interface GithubAccount {
  available: boolean
  login: string | null
  authenticated: boolean
}
/** A pull request in the repository selected by the workspace. */
export interface GitPullRequest {
  number: number
  title: string
  url: string
  headRefName: string
  baseRefName: string
  isDraft: boolean
  state: string
  headRefOid: string
}

/** Device-code sign-in progress, containing no access token or raw command output. */
export type GithubLoginState =
  | { status: 'starting' }
  | { status: 'waiting'; code: string; url: string }
  | { status: 'complete' }
  | { status: 'failed'; reason: 'timeout' | 'login-failed' }

/** Explicit local or pull-request comparison selected for source review. */
export type GitReviewTarget = { kind: 'working' } | { kind: 'branch'; base: string } | { kind: 'pull-request'; number: number }
/** Bounded repository facts captured before the reviewer starts. */
export interface GitReviewContext {
  root: string
  head: string | null
  base: string | null
  revision: string
  files: string[]
  diff: string
  truncated: boolean
  target: GitReviewTarget
}
