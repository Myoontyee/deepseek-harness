/** Register saved SSH settings and reveal terminals after the Session surface mounts. */
import type { Context } from '@deepseek-ai/cordis'
import { useEffect } from 'react'
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ConnectionPreferences, SshSessionReceipt } from '@deepseek-ai/dsh-api-connection-controller/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-terminal/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ConnectionsPage, type ConnectionActions } from './ConnectionsPage.tsx'
import { en, zh, type ConnectionKey } from './locales.ts'
import { connectionStyles } from './styles.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.connections': ConnectionKey
  }
}
/** Dependencies used by connection actions and terminal navigation. */
export const inject = ['slots', 'locale', 'remote', 'remote.connections', 'configForms', 'uiWorkspace', 'sidebarRight']
function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}
interface Reveal {
  hooks: { pending: ObservableSnapshot<SshSessionReceipt | undefined>; mounted: ObservableSnapshot<SessionId | undefined> }
  reveal: () => void
}
function RevealTerminal({ usePending, useMounted, reveal }: PropsRuntime<'shell.overlay'> & InjectFace<Reveal>) {
  const pending = usePending(value => value)
  const mounted = useMounted(value => value)
  useEffect(() => {
    if (pending?.sessionId === mounted) reveal()
  }, [pending, mounted, reveal])
  return null
}
/**
 * Mount connection settings and an Agent-surface terminal handoff.
 * @param ctx - authenticated browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('settings.connections', { en, zh }), 'connections: copy')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = connectionStyles
    document.head.append(style)
    return () => {
      style.remove()
    }
  }, 'connections: styles')
  const pending = createSnapshotStore<SshSessionReceipt | undefined>(undefined)
  const form = ctx.configForms.get<ConnectionPreferences>('connection-controller')
  const actions: ConnectionActions = {
    hooks: { preferences: { getSnapshot: () => form.getSnapshot(), subscribe: listener => form.subscribe(listener) } },
    list: async () => unwrap(await ctx.remote.connections.list()),
    save: (id, profile) =>
      form.mutate(
        profile ? [{ op: 'set', path: ['profiles', id], value: { ...profile } }] : [{ op: 'unset', path: ['profiles', id] }],
      ),
    test: async (id, signal) => unwrap(await ctx.remote.connections.test(id, signal)),
    start: async (id, requestId, terminal, signal) => unwrap(await ctx.remote.connections.start(id, requestId, terminal, signal)),
    open: (receipt) => {
      if (receipt.terminalId) pending.set(receipt)
      ctx.uiWorkspace.openSession(receipt.sessionId)
    },
  }
  const t = ctx.locale.bind('settings.connections')
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'connections',
        order: 44,
        label: () => t('nav'),
        locale: 'settings.connections',
        inject: () => actions,
      },
      ConnectionsPage,
    ),
  )
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'connections.terminal',
        inject: () => ({
          hooks: { pending, mounted: ctx.sidebarRight.mounted },
          reveal: () => {
            const receipt = pending.getSnapshot()
            if (!receipt?.terminalId) return
            const sessionId = receipt.sessionId
            ctx.sidebarRight.openTabIn(sessionId, 'terminal', { params: { terminalId: receipt.terminalId } })
            if (ctx.sidebarRight.tabsIn(sessionId).some(tab => tab.kind === 'terminal')) pending.set(undefined)
          },
        }),
      },
      RevealTerminal,
    ),
  )
}
