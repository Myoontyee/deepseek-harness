/** Pinned connection target for each SSH control Session. */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
/** Endpoint selected at connection time; private-key contents are never stored here. */
export const sshBindingRecord = z.object({
  connectionId: z.string(),
  alias: z.string(),
  label: z.string(),
  directory: z.string(),
  host: z.string(),
  user: z.string(),
  port: z.number().int().min(1).max(65535),
})
/** Stored remote target and working directory. */
export type SshBinding = z.infer<typeof sshBindingRecord>
/** SSH Session targets survive app restarts; live SSH processes do not. */
export const connectionDomainSpec = defineDomain({
  name: 'ssh_connections',
  version: 1,
  tables: { sessions: domainTable<SessionId, SshBinding>(sshBindingRecord) },
})
