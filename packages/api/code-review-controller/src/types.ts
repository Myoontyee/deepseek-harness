/** Review requests and receipts; actual progress remains owned by the created Session. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { GitReviewTarget } from '@deepseek-ai/dsh-api-git-controller/types'
/** Persistent reviewer model selection and additional review instructions. */
export interface ReviewRepositoryPreferences {
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
/** Global defaults and saved per-workspace review choices. */
export interface ReviewPreferences {
  /** Reviewer provider; empty follows the ordinary chat model. */
  provider: string
  /** Reviewer model paired with provider. */
  model: string
  /** Additional review criteria supplied by the user. */
  instructions: string
  /** Reviewer preferences keyed by registered workspace identity. */
  repositories: Record<string, ReviewRepositoryPreferences>
}
/** One user-authorized review attempt; keep its identity stable while retrying. */
export interface ReviewRequest {
  requestId: string
  workspaceId: WorkspaceId
  target: GitReviewTarget
  /** Saved review focus for this workspace. */
  focus: string
  language?: 'zh' | 'en'
  preferences?: { provider: string; model: string; instructions: string }
}
/** Acknowledgement that the review Session accepted its input, not a completed review. */
export type ReviewReceipt =
  | { sessionId: SessionId; reused: true }
  | { sessionId: SessionId; reused: false; head: string | null; base: string | null; truncated: boolean }
