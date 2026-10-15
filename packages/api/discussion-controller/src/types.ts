/** Durable discussion and assistant identities; transcript bodies remain in native Sessions. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Stable user-managed assistant identity, independent of an active model process. */
export type AssistantId = Branded<'DiscussionAssistantId'>
/** Stable discussion identity, independent of the displayed pane. */
export type DiscussionId = Branded<'DiscussionId'>
/** Explicitly saved memory entry identity. */
export type AssistantMemoryId = Branded<'AssistantMemoryId'>
/** User-facing starter policies; all retain discussion history. */
export type AssistantTemplate = 'temporary' | 'project' | 'resident'
/** Memory visibility is independent of discussion history retention. */
export type AssistantMemoryMode = 'off' | 'project' | 'assistant'

/** Persistent identity and user-authored responsibilities; does not start an Agent. */
export interface DiscussionAssistant {
  id: AssistantId
  revision: number
  name: string
  instructions: string
  template: AssistantTemplate
  memoryMode: AssistantMemoryMode
  archived: boolean
  createdAt: number
  updatedAt: number
}

/** Explicit user-confirmed memory, never an automatically extracted inference. */
export interface AssistantMemory {
  id: AssistantMemoryId
  assistantId: AssistantId
  revision: number
  scope: 'project' | 'assistant'
  /** Exact Host workspace directory when scope is project, otherwise empty. */
  project: string
  text: string
  createdAt: number
  updatedAt: number
}

/** Small immutable quotation and mutable topic metadata; never a duplicate transcript. */
export interface DiscussionTopic {
  id: DiscussionId
  parentSessionId: SessionId
  sessionId: SessionId
  assistantId: AssistantId
  revision: number
  title: string
  quote: string
  sourceUrl: string
  sourceMessage: string
  project: string
  state: 'open' | 'resolved' | 'archived'
  createdAt: number
  updatedAt: number
}

/** Explicit edits supplied by the assistant settings panel. */
export interface AssistantDraft {
  name: string
  instructions: string
  template: AssistantTemplate
  memoryMode: AssistantMemoryMode
}

/** User-confirmed memory content and visibility. */
export interface MemoryDraft {
  assistantId: AssistantId
  scope: 'project' | 'assistant'
  project: string
  text: string
}

/** Selection and identity supplied once when a topic is created. */
export interface TopicDraft {
  requestId: string
  parentSessionId: SessionId
  assistantId: AssistantId
  title: string
  quote: string
  sourceUrl: string
  sourceMessage: string
}
