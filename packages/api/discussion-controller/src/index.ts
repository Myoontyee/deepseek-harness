/** Persistent discussion metadata and explicit assistant memory, without a background model loop. */
import { randomUUID } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-permission-presets'
import { assistantRecord, discussionDomainSpec, memoryRecord, topicRecord } from './spec.ts'
import { discussionContext, selectAssistantMemory } from './policy.ts'
import { installAssistantRouting } from './routing.ts'
import type {
  AssistantDraft, AssistantId, AssistantMemory, AssistantMemoryId, DiscussionAssistant, DiscussionId, DiscussionTopic,
  MemoryDraft, TopicDraft,
} from './types.ts'

/** Configurable upper bound on confirmed notes included in a model request. */
export interface Config {
  /** Maximum characters of complete confirmed memories included per model request; zero disables injection. */
  maxMemoryChars: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Persistent discussion links and user-managed assistants. */
    discussionController: DiscussionController
  }
}

/** Metadata lives in a storage domain; messages and attachments use native Session storage. */
export default class DiscussionController extends TypertRemoteService {
  static inject = ['typert', 'storageDomain', 'sessionController', 'systemPrompt', 'permissionPresets', 'agents']
  static Config = z.object({ maxMemoryChars: z.number().step(1).min(0).max(24000).default(6000) })
  private domain: Domain<typeof discussionDomainSpec> | undefined
  private readonly creating = new Map<DiscussionId, { input: string; operation: Promise<DiscussionTopic> }>()

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'discussionController', { namespace: 'discussions' })
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(discussionDomainSpec)
    this.domain = domain
    installAssistantRouting(this.ctx,
      () => [...domain.table('assistants').entries()].map(([, value]) => value),
      (agent) => {
        const topic = [...domain.table('topics').entries()].find(([, value]) => value.sessionId === agent.id)?.[1]
        return topic ? domain.table('assistants').get(topic.assistantId) : undefined
      },
      (agent, assistant) => selectAssistantMemory(assistant, agent.session.header.cwd ?? '',
        [...domain.table('memories').entries()].map(([, value]) => value), this.config.maxMemoryChars),
      async agent => (await this.ctx.sessionController.inspect(agent.id)).events.slice(agent.session.inheritedEventCount))
    this.ctx.effect(() => async () => {
      await Promise.allSettled([...this.creating.values()].map(value => value.operation))
      await domain.close()
    }, 'discussions: durable metadata')
    this.ctx.effect(() => this.ctx.systemPrompt.context({
      name: 'discussion-assistant', order: 46, interpolate: false,
      text: ({ agent }) => {
        if (!agent) return ''
        const topic = [...domain.table('topics').entries()].find(([, value]) => value.sessionId === agent.id)?.[1]
        if (!topic) return ''
        return discussionContext(topic)
      },
    }), 'discussions: logged assistant context')
  }

  private storage(): Domain<typeof discussionDomainSpec> {
    if (!this.domain) throw new Error('Discussion storage is not ready')
    return this.domain
  }

  /** List saved identities without starting any model process.
   * @returns Saved assistant profiles, including archived ones.
   */
  @Remote
  assistants(): DiscussionAssistant[] {
    return [...this.storage().table('assistants').entries()].map(([, value]) => value)
  }

  /** Save a user-defined assistant without creating a conversation.
   * @param draft - Explicit identity and memory policy.
   * @returns Durably stored assistant.
   */
  @Remote
  async createAssistant(draft: AssistantDraft): Promise<DiscussionAssistant> {
    await this.validateAssistantModel(draft)
    const now = Date.now()
    const value = assistantRecord.parse({ ...draft, id: randomUUID(), revision: 1, archived: false, createdAt: now, updatedAt: now })
    await this.storage().table('assistants').put(value.id, value)
    return value
  }

  /** Update one profile without overwriting another window's edits.
   * @param id - Saved assistant identity.
   * @param revision - Revision shown in the editor.
   * @param draft - Replacement editable fields.
   * @returns Committed profile.
   */
  @Remote
  async updateAssistant(id: AssistantId, revision: number, draft: AssistantDraft): Promise<DiscussionAssistant> {
    await this.validateAssistantModel(draft)
    return this.storage().table('assistants').update(id, (current) => {
      if (current.revision !== revision) throw new Error('Assistant changed in another window; reload before saving')
      return assistantRecord.parse({ ...current, ...draft, reasoningEffort: draft.reasoningEffort,
        id, revision: revision + 1, updatedAt: Date.now() })
    })
  }

  private async validateAssistantModel(draft: AssistantDraft): Promise<void> {
    if (!draft.provider && !draft.model && draft.reasoningEffort === undefined) return
    const catalog = await this.ctx.sessionController.modelCatalog()
    const selected = catalog.groups.find(group => group.id === draft.provider)?.models.find(model => model.id === draft.model)
    if (!selected) {
      throw new Error('Selected assistant model is unavailable; check model settings / 助手模型不可用，请检查模型设置')
    }
    if (draft.reasoningEffort !== undefined && !selected.reasoning?.efforts.some(effort => effort.id === draft.reasoningEffort)) {
      throw new Error('Selected reasoning effort is unsupported by this model / 当前模型不支持所选思考强度，请重新选择')
    }
  }

  /** Read explicitly saved notes for the settings editor.
   * @param id - Assistant identity.
   * @returns Its stored memory entries, including entries currently disabled by policy.
   */
  @Remote
  memories(id: AssistantId): AssistantMemory[] {
    return [...this.storage().table('memories').entries()].map(([, value]) => value).filter(value => value.assistantId === id)
  }

  /** Save a memory only after an explicit user action.
   * @param draft - Confirmed text and scope.
   * @returns Committed memory entry.
   */
  @Remote
  async remember(draft: MemoryDraft): Promise<AssistantMemory> {
    if (!this.storage().table('assistants').get(draft.assistantId)) throw new Error('Assistant does not exist')
    const now = Date.now()
    const memory = memoryRecord.parse({ ...draft, id: randomUUID(), revision: 1, createdAt: now, updatedAt: now })
    await this.storage().table('memories').put(memory.id, memory)
    return memory
  }

  /** Edit a confirmed note without overwriting another window's change.
   * @param id - Existing memory identity.
   * @param revision - Revision displayed in the editor.
   * @param draft - Replacement text and scope for the same assistant.
   * @returns Committed memory entry.
   */
  @Remote
  updateMemory(id: AssistantMemoryId, revision: number, draft: MemoryDraft): Promise<AssistantMemory> {
    return this.storage().table('memories').update(id, (current) => {
      if (current.revision !== revision || current.assistantId !== draft.assistantId) {
        throw new Error('Memory changed or belongs to another assistant; reload before saving')
      }
      return memoryRecord.parse({ ...current, ...draft, id, revision: revision + 1, updatedAt: Date.now() })
    })
  }

  /** Remove one confirmed note without deleting any conversation.
   * @param id - Memory identity selected by the user.
   * @returns Whether an entry was removed.
   */
  @Remote
  forget(id: AssistantMemoryId): Promise<boolean> { return this.storage().table('memories').delete(id) }

  /** List the small topic index for one parent; transcript messages are loaded separately.
   * @param parentSessionId - Main conversation identity.
   * @returns Durable topics, most recently updated first.
   */
  @Remote
  topics(parentSessionId: SessionId): DiscussionTopic[] {
    return [...this.storage().table('topics').entries()].map(([, value]) => value)
      .filter(value => value.parentSessionId === parentSessionId).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** Create an independent, initially read-only native Session, without running a model or copying parent history.
   * @param draft - Idempotency key, source quotation and selected assistant.
   * @returns Persisted topic and Session identity.
   */
  @Remote
  async createTopic(draft: TopicDraft): Promise<DiscussionTopic> {
    if (!/^[a-zA-Z0-9-]{16,80}$/u.test(draft.requestId)) throw new Error('Invalid discussion request identity')
    const id = draft.requestId as DiscussionId, input = JSON.stringify(draft)
    const stored = this.storage().table('topics').get(id)
    if (stored) {
      if (stored.parentSessionId !== draft.parentSessionId || stored.assistantId !== draft.assistantId
        || stored.title !== draft.title || stored.quote !== draft.quote
        || stored.sourceUrl !== draft.sourceUrl || stored.sourceMessage !== draft.sourceMessage) {
        throw new Error('Discussion request identity already belongs to another topic')
      }
      return stored
    }
    const pending = this.creating.get(id)
    if (pending) {
      if (pending.input !== input) throw new Error('Discussion creation is already in progress with different inputs')
      return pending.operation
    }
    const operation = this.create(draft, id).finally(() => { this.creating.delete(id) })
    this.creating.set(id, { input, operation })
    return operation
  }

  private async create(draft: TopicDraft, id: DiscussionId): Promise<DiscussionTopic> {
    const assistant = this.storage().table('assistants').get(draft.assistantId)
    if (!assistant || assistant.archived) throw new Error('Select an active assistant')
    const source = (await this.ctx.sessionController.list({}, new AbortController().signal)).items
      .find(value => value.sessionId === draft.parentSessionId)
    if (!source) throw new Error('Parent conversation is unavailable')
    const now = Date.now(), sessionId = `discussion-${id}` as SessionId
    const topic = topicRecord.parse({ ...draft, id, sessionId, project: source.cwd ?? '',
      revision: 1, state: 'open', createdAt: now, updatedAt: now })
    const created = await this.ctx.sessionController.create({ sessionId, ...(topic.project ? { cwd: topic.project } : {}) })
    if (created.sessionId !== sessionId) throw new Error('Discussion identity is already in use; create a new topic')
    const agent = this.ctx.agents.get(sessionId)
    if (!agent) throw new Error('Discussion Session did not activate; retry to recover it')
    this.ctx.permissionPresets.set(agent.session, 'read-only')
    await this.ctx.sessionController.rename({ sessionId, title: topic.title })
    await this.storage().table('topics').put(id, topic)
    return topic
  }

  /** Resolve, archive or reopen a topic without deleting its history.
   * @param id - Topic identity.
   * @param revision - Revision the caller displayed.
   * @param state - New topic visibility state.
   * @returns Committed metadata.
   */
  @Remote
  setTopicState(id: DiscussionId, revision: number, state: 'open' | 'resolved' | 'archived'): Promise<DiscussionTopic> {
    return this.storage().table('topics').update(id, (current) => {
      if (current.revision !== revision) throw new Error('Discussion changed in another window; reload before saving')
      return { ...current, revision: revision + 1, state, updatedAt: Date.now() }
    })
  }
}
