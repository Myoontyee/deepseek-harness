/** Historical assistant labels and removal of retired discussion tabs; no interactive feature entries. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import { registerAssistantIdentities } from './assistant-identities.ts'
import { assistantReferenceRule, registerRetiredAssistantReferences } from './assistant-mentions.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Retired slot retained only for source compatibility; no implementation is registered. */
    'discussion.board': { kind: 'single'; scope: 'session' }
    /** Retired slot retained only for source compatibility; no implementation is registered. */
    'discussion.conversation': { kind: 'single'; scope: 'session' }
  }
  interface ResourceProtocolMap { discussionboard: { reference: SessionReference } }
}
declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { discussionBoard: unknown }
}

/** Only historical message rendering and obsolete-tab cleanup remain active. */
export const inject = ['uiConversation', 'sidebarRight', 'inputTriggers']

/** Preserve old reply labels and close obsolete discussion panels without deleting Sessions.
 * @param ctx - Current Client scope.
 */
export function apply(ctx: Context): void {
  registerAssistantIdentities(ctx)
  registerRetiredAssistantReferences(ctx)
  ctx.effect(() => ctx.uiConversation.userText.register(assistantReferenceRule))
  ctx.effect(() => {
    let live = true, queued = false
    const clean = (): void => {
      if (queued || !live) return
      queued = true
      queueMicrotask(() => {
        queued = false
        if (!live) return
        const sessionId = ctx.sidebarRight.mounted.getSnapshot()
        if (sessionId === undefined) return
        for (const tab of ctx.sidebarRight.tabsIn(sessionId)) {
          if (tab.kind === 'discussionboard') ctx.sidebarRight.close(tab.id)
        }
      })
    }
    const disposers = [ctx.sidebarRight.mounted.subscribe(clean), ctx.sidebarRight.openTabs.subscribe(clean)]
    clean()
    return () => { live = false; for (const dispose of disposers) dispose() }
  }, 'discussions: close retired tabs')
}
