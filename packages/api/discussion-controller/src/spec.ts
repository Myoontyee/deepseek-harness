/** Small durable records reference native Session logs rather than copying conversation histories. */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { AssistantId, AssistantMemory, AssistantMemoryId, DiscussionAssistant, DiscussionId, DiscussionTopic } from './types.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

const identity = z.string().min(1).max(160)
const revision = z.number().int().positive()
const timestamp = z.number().int().nonnegative()

/** Stored assistant profile validation. */
export const assistantRecord = z.object({
  id: identity.transform(value => value as AssistantId), revision,
  name: z.string().trim().min(1).max(120), instructions: z.string().max(12000),
  template: z.enum(['temporary', 'project', 'resident']), memoryMode: z.enum(['off', 'project', 'assistant']),
  provider: z.string().trim().min(1).max(200).optional(), model: z.string().trim().min(1).max(300).optional(),
  avatar: z.string().max(48000).refine(value => value.length <= 16 || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/u.test(value), 'Choose an emoji or a small local PNG, JPEG or WebP image').optional(),
  showModel: z.boolean().optional(),
  archived: z.boolean(), createdAt: timestamp, updatedAt: timestamp,
}).refine(value => Boolean(value.provider) === Boolean(value.model), 'Select both a provider and model')

/** Saved memory is explicit text with scope; disabled memory remains stored for later review. */
export const memoryRecord = z.object({
  id: identity.transform(value => value as AssistantMemoryId), assistantId: identity.transform(value => value as AssistantId),
  revision, scope: z.enum(['project', 'assistant']),
  project: z.string().max(4096), text: z.string().trim().min(1).max(12000), createdAt: timestamp, updatedAt: timestamp,
}).refine(value => value.scope === 'project' ? value.project.length > 0 : value.project === '', 'Memory scope and project must agree')

/** Topic metadata keeps only the source quotation and Session identities. */
export const topicRecord = z.object({
  id: identity.transform(value => value as DiscussionId), parentSessionId: identity.transform(value => value as SessionId),
  sessionId: identity.transform(value => value as SessionId), assistantId: identity.transform(value => value as AssistantId), revision,
  title: z.string().trim().min(1).max(180), quote: z.string().max(24000), sourceUrl: z.string().max(4096),
  sourceMessage: z.string().max(512), project: z.string().max(4096), state: z.enum(['open', 'resolved', 'archived']),
  createdAt: timestamp, updatedAt: timestamp,
})

/** Discussion metadata and confirmed memories have independent rows and survive panel closure. */
export const discussionDomainSpec = defineDomain({
  name: 'conversation_discussions', version: 1,
  tables: {
    assistants: domainTable<AssistantId, DiscussionAssistant>(assistantRecord),
    memories: domainTable<AssistantMemoryId, AssistantMemory>(memoryRecord),
    topics: domainTable<DiscussionId, DiscussionTopic>(topicRecord),
  },
})
