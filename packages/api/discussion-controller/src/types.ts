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
  /** Explicit route; absent on profiles created before model selection was introduced. */
  provider?: string | undefined
  model?: string | undefined
  /** Omitted uses the selected model's default; explicit values must be advertised by that model. */
  reasoningEffort?: string | undefined
  /** Emoji or a bounded local image data URL; never a remote image request. */
  avatar?: string | undefined
  showModel?: boolean | undefined
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
  provider?: string | undefined
  model?: string | undefined
  reasoningEffort?: string | undefined
  avatar?: string | undefined
  showModel?: boolean | undefined
}

/** Immutable identity captured for a particular reply, independent of later profile edits. */
export interface AssistantSpeaker {
  id: AssistantId
  name: string
  avatar: string
  modelName?: string
}

/** Conversation route to resume after a temporary assistant invocation. */
export interface AssistantReturnModel {
  provider: string
  model: string
  reasoningEffort?: string | undefined
  /** Most recent explicit model-selection event considered when capturing this route. */
  selectionSeq: number
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Logged assistant selection and context; older readers retain it as ordinary context. */
    'saved-assistant': {
      kind: 'saved-assistant'
      form: 'notice'
      summary: string
      turn: number
      step: number
      speaker: AssistantSpeaker
      returnModel?: AssistantReturnModel
    }
    /** Explicit boundary ending a temporary saved-assistant invocation. */
    'saved-assistant-return': {
      kind: 'saved-assistant-return'
      form: 'notice'
      summary: string
    }
  }
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
