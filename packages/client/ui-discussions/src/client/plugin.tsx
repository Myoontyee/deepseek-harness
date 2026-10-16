/** Persistent parent-scoped discussion boards and user-managed assistant settings. */
import { Service, type Context } from '@deepseek-ai/cordis'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ResponseAnnotation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { AssistantSettings, type AssistantSettingsActions } from './AssistantSettings.tsx'
import { DiscussionBoard, type DiscussionBoardActions } from './DiscussionBoard.tsx'
import { en, zh } from './locales.ts'
import css from './Discussions.module.css'
import { registerAssistantMentions } from './assistant-mentions.ts'
import { registerAssistantIdentities } from './assistant-identities.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Render the parent's topic list and creation form; absent registrations leave the discussion tab empty. */
    'discussion.board': { kind: 'single'; scope: 'session' }
    /** Render the selected topic's native Conversation with its own Session bindings. */
    'discussion.conversation': { kind: 'single'; scope: 'session' }
  }
  interface ResourceProtocolMap { discussionboard: { reference: SessionReference } }
}
declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { discussionBoard: unknown }
}

const id = '@deepseek-ai/dsh-client-ui-discussions'
const prefix = 'dsh-resource://discussionboard/session/'
function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

function ChatView(props: ConversationViewsProps) { return props.renderSlot('conversation.session', { view: 'chat' }) }
function TopicConversation({ useSession, useConversation, renderFactorySlot }:
  PropsRuntime<'discussion.conversation'> & PropsRenderFactories) {
  const session = useSession(value => value), conversation = useConversation(value => value)
  const active = conversation.activeTargets.size > 0 || !session.blank || session.running
  const hero = !active && session.openState === 'open'
  return renderFactorySlot('conversation.content', { variant: 'embedded', phase: active ? 'active' : hero ? 'hero' : 'settling', hero },
    { slots: { views: ChatView } })
}
function BoardTab({ useResource, useTabInfo, SessionProvider, renderSlot }:
  PropsRuntime<'sidebar.right.pane.tab'> & PropsRenderSlots<'discussion.board'>) {
  const { tab } = useTabInfo(), resource = useResource<'discussionboard'>(tab.contentId)
  return resource.value ? <SessionProvider session={resource.value.reference}>{renderSlot('discussion.board', {})}</SessionProvider> : null
}
function BoardButton({ open, t }: PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<'discussions'> & { open: () => void }) {
  return <button type="button" className={css.trigger} onClick={open}>{t('board')}</button>
}

class DiscussionNavigation extends Service {
  readonly quotes = createSnapshotStore<ReadonlyMap<SessionId, ResponseAnnotation>>(new Map())
  constructor(ctx: Context) { super(ctx, 'discussionNavigation') }
  open(parent: SessionId, quote?: ResponseAnnotation): void {
    const quotes = new Map(this.quotes.getSnapshot())
    if (quote) quotes.set(parent, quote)
    else quotes.delete(parent)
    this.quotes.set(quotes)
    this.ctx.sidebarRight.openResource(`${prefix}${encodeURIComponent(parent)}`, {
      preferNewPane: true,
    })
  }
}

/** Dependencies used only while a discussion or settings panel is actually opened. */
export const inject = ['slots', 'locale', 'remote', 'remote.discussions', 'remote.session', 'modelDirectories', 'sessions', 'resources', 'sidebarRight', 'sidebarRightTabs', 'uiWorkspace']

/** Register lazy discussion panes and the assistant settings panel.
 * @param ctx - Authenticated client runtime.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('discussions', { en, zh }))
  ctx.inject(['inputTriggers', 'uiConversation'], (scope) => {
    registerAssistantMentions(scope)
    registerAssistantIdentities(scope)
  })
  const t = ctx.locale.bind('discussions'), navigation = new DiscussionNavigation(ctx)
  const assistantActions: AssistantSettingsActions = {
    hooks: { models: ctx.modelDirectories.catalog.store },
    refreshModels: () => { ctx.modelDirectories.catalog.refresh() },
    listAssistants: async () => unwrap(await ctx.remote.discussions.assistants()),
    saveAssistant: async (current, draft) => unwrap(await (current
      ? ctx.remote.discussions.updateAssistant(current.id, current.revision, draft)
      : ctx.remote.discussions.createAssistant(draft))),
    listMemories: async assistant => unwrap(await ctx.remote.discussions.memories(assistant.id)),
    remember: async draft => unwrap(await ctx.remote.discussions.remember(draft)),
    updateMemory: async (memory, draft) => unwrap(await ctx.remote.discussions.updateMemory(memory.id, memory.revision, draft)),
    forget: async memory => unwrap(await ctx.remote.discussions.forget(memory.id)),
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'saved-assistants', order: 46, locale: 'discussions', label: () => t('assistants'),
    inject: (): AssistantSettingsActions => assistantActions,
  }, AssistantSettings))
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities', id: 'discussions', order: 45, locale: 'discussions',
    inject: (sessionId: SessionId) => ({ open: () => { navigation.open(sessionId) } }),
  }, BoardButton))
  ctx.effect(() => ctx.resources.register({
    protocol: 'discussionboard',
    async *open(address, { signal }) {
      const url = new URL(address)
      if (url.hostname !== 'discussionboard' || !url.pathname.startsWith('/session/')) throw new Error('Invalid discussion address')
      const parent = decodeURIComponent(url.pathname.slice('/session/'.length)) as SessionId
      if (!parent || signal.aborted) return
      const reference = ctx.sessions.retain(parent, { source: 'discussionBoard', signal })
      try {
        await reference.ready
        yield { ok: true, value: { reference } }
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve()
          else signal.addEventListener('abort', () => { resolve() }, { once: true })
        })
      } finally { reference.release() }
    },
  }))
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id, kind: 'discussionboard', patterns: [`${prefix}**`], priority: 'builtin',
    canOpen: address => address.startsWith(prefix), title: () => t('board'),
  }))
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: id, children: { 'discussion.board': { kind: 'single', scope: 'session' } },
  }, BoardTab))
  ctx.slots.inject('discussion.board', () => ctx.slots.register({
    name: 'discussion.board', locale: 'discussions',
    children: { 'discussion.conversation': { kind: 'single', scope: 'session' } },
    inject: (parent: SessionId): DiscussionBoardActions => {
      const requests = new Map<string, string>()
      return {
        list: async () => unwrap(await ctx.remote.discussions.topics(parent)),
        assistants: assistantActions.listAssistants,
        create: async (assistant, title, quote) => {
          const key = JSON.stringify([assistant.id, title, quote])
          const requestId = requests.get(key) ?? randomUUID(); requests.set(key, requestId)
          const topic = unwrap(await ctx.remote.discussions.createTopic({ requestId, parentSessionId: parent,
            assistantId: assistant.id, title, quote: quote?.text ?? '', sourceUrl: quote?.sourceUrl ?? '', sourceMessage: quote?.sourceMessage ?? '' }))
          requests.delete(key)
          const quotes = new Map(navigation.quotes.getSnapshot()); quotes.delete(parent); navigation.quotes.set(quotes)
          return topic
        },
        retain: topic => ctx.sessions.retain(topic.sessionId, { source: 'discussionBoard' }),
        changeState: async (topic, state) => unwrap(await ctx.remote.discussions.setTopicState(topic.id, topic.revision, state)),
        openParent: () => { ctx.uiWorkspace.openSession(parent) },
        hooks: { quote: {
          getSnapshot: () => navigation.quotes.getSnapshot().get(parent),
          subscribe: listener => navigation.quotes.subscribe(listener),
        } },
      }
    },
  }, DiscussionBoard))
  ctx.slots.inject('discussion.conversation', () => ctx.slots.register({ name: 'discussion.conversation' }, TopicConversation))
  ctx.effect(() => () => { navigation.quotes.set(new Map()) })
}
