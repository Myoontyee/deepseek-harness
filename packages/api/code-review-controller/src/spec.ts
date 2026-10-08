/** Durable inputs for an admitted or retryable review preparation. */
import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
/** Snapshot and receipt source; model-visible context is also recorded by the normal prompt-context mechanism. */
export const reviewRecord = z.object({
  requestKey: z.string(),
  context: z.string(),
  prompt: z.string(),
  provider: z.string(),
  model: z.string(),
  head: z.string().nullable(),
  base: z.string().nullable(),
  truncated: z.boolean(),
  admitted: z.boolean(),
  createdAt: z.string(),
})
/** One immutable preparation with an admission flag updated after inbox acceptance. */
export type ReviewRecord = z.infer<typeof reviewRecord>
/** Code-review input storage, independent from ordinary configuration preferences. */
export const reviewDomainSpec = defineDomain({
  name: 'code_review',
  version: 1,
  tables: { reviews: domainTable<SessionId, ReviewRecord>(reviewRecord) },
})
