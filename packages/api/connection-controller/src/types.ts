/** Saved connection preferences and display-safe SSH results. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
/** Stable connection identity derived from a saved OpenSSH alias. */
export type SshConnectionId = Branded<'SshConnectionId'>
/** User-owned bookmark; credential material stays in OpenSSH/its agent. */
export interface SshProfile {
  /** Concrete OpenSSH Host alias used to resolve the server. */
  alias: string
  /** User-visible connection name. */
  label: string
  /** Saved remote POSIX directory; empty selects the account home. */
  directory: string
  /** Explicit permission to execute AI commands with this SSH account. */
  allowAgentCommands: boolean
}
/** Connection row with an opaque identity and its discovery source. */
export interface SavedSshConnection extends SshProfile {
  id: SshConnectionId
  saved: boolean
}
/** Saved overrides over discoverable OpenSSH aliases. */
export interface ConnectionPreferences {
  profiles: Record<string, SshProfile>
}
/** Existing aliases plus nonfatal discovery diagnostics. */
export interface SshConnectionList {
  connections: SavedSshConnection[]
  warnings: string[]
}
/** Successful authentication probe and display-safe resolved endpoint. */
export interface SshProbe {
  connected: boolean
  host: string
  user: string
  port: number
  message: string
}
/** Settled local SSH process; timeout does not prove the remote command stopped. */
export interface SshCommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  truncated: boolean
}
/** Dedicated local control Session and an optional user terminal on the remote host. */
export interface SshSessionReceipt {
  sessionId: SessionId
  terminalId?: WebTerminalId
}
