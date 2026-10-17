/** Read-only archive access and retirement of previously selected saved assistants. */
import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { discussionDomainSpec } from './spec.ts'
import { installAssistantRetirement } from './retirement.ts'
import type { AssistantId, AssistantMemory, DiscussionAssistant, DiscussionTopic } from './types.ts'

/** Legacy configuration accepted for existing profiles; memory injection is retired. */
export interface Config {
  /** Retained for configuration compatibility; no saved memory is injected. */
  maxMemoryChars: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Read-only access to records retained after assistant and discussion retirement. */
    discussionController: DiscussionController
  }
}

/** Existing records remain readable; no creation, mutation or assistant selection is exposed. */
export default class DiscussionController extends TypertRemoteService {
  static inject = ['typert', 'storageDomain', 'sessionController', 'agents']
  static Config = z.object({ maxMemoryChars: z.number().step(1).min(0).max(24000).default(6000) })
  private domain: Domain<typeof discussionDomainSpec> | undefined

  constructor(ctx: Context, _config: Config) {
    super(ctx, 'discussionController', { namespace: 'discussions' })
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(discussionDomainSpec)
    this.domain = domain
    installAssistantRetirement(this.ctx,
      async agent => (await this.ctx.sessionController.inspect(agent.id)).events.slice(agent.session.inheritedEventCount))
    this.ctx.effect(() => () => domain.close(), 'discussions: retained archive')
  }

  private storage(): Domain<typeof discussionDomainSpec> {
    if (!this.domain) throw new Error('Discussion archive is not ready')
    return this.domain
  }

  /** Read retained profiles without activating their settings, memory or models.
   * @returns Historical assistant records, including archived ones.
   */
  @Remote
  assistants(): DiscussionAssistant[] {
    return [...this.storage().table('assistants').entries()].map(([, value]) => value)
  }

  /** Read historical explicit notes without injecting them into any request.
   * @param id - Original assistant identity.
   * @returns Its retained memory entries.
   */
  @Remote
  memories(id: AssistantId): AssistantMemory[] {
    return [...this.storage().table('memories').entries()].map(([, value]) => value).filter(value => value.assistantId === id)
  }

  /** Read historical topic links; their conversations remain ordinary native Sessions.
   * @param parentSessionId - Original parent conversation.
   * @returns Retained metadata ordered by last update.
   */
  @Remote
  topics(parentSessionId: SessionId): DiscussionTopic[] {
    return [...this.storage().table('topics').entries()].map(([, value]) => value)
      .filter(value => value.parentSessionId === parentSessionId).sort((a, b) => b.updatedAt - a.updatedAt)
  }
}
