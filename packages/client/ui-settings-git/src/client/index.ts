/** Git settings registration and a shell-owned operation-notice lifetime. */
import type { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ReviewPreferences } from '@deepseek-ai/dsh-api-code-review-controller/types'
import { ReviewPage, type ReviewPageActions } from './ReviewPage.tsx'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { GitPreferences } from '@deepseek-ai/dsh-api-git-controller/types'
import { GitPage, type GitPageActions } from './GitPage.tsx'
import { en, zh, type GitKey } from './locales.ts'
import { gitStyles } from './styles.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.git': GitKey
  }
}
/** Required authenticated Git and preference services. */
export const inject = ['slots', 'locale', 'remote', 'remote.git', 'configForms']
function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}
/**
 * Mount Git settings and cross-page operation feedback.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('settings.git', { en, zh }), 'git: dictionaries')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = gitStyles
    document.head.append(style)
    return () => {
      style.remove()
    }
  }, 'git: styles')
  const notice = createSnapshotStore<{ text: string; success: boolean; sequence: number } | null>(null)
  let sequence = 0
  const api = ctx.remote.git
  const gitForm = ctx.configForms.get<GitPreferences>('git-controller')
  const actions: GitPageActions = {
    workspaces: async () => unwrap(await api.workspaces()),
    status: async id => unwrap(await api.status(id)),
    history: async id => unwrap(await api.history(id)),
    branches: async id => unwrap(await api.branches(id)),
    diff: async (id, path, staged) => unwrap(await api.diff(id, path, staged)),
    stage: async (id, paths, revision) => unwrap(await api.stage(id, paths, revision)),
    unstage: async (id, paths, revision) => unwrap(await api.unstage(id, paths, revision)),
    commit: async (id, message, revision) => unwrap(await api.commit(id, message, revision)),
    switchBranch: async (id, branch, create, revision) => unwrap(await api.switchBranch(id, branch, create, revision)),
    network: async (id, action, revision) => unwrap(await api.network(id, action, revision)),
    account: async id => unwrap(await api.githubAccount(id)),
    pulls: async id => unwrap(await api.pullRequests(id)),
    login: async function* (id, signal) {
      for await (const result of api.loginGithub(id, signal)) yield result
    },
    createPr: async (id, title, body, base, revision) => unwrap(await api.createPullRequest(id, title, body, base, revision)),
    checkoutPr: async (id, number, revision) => unwrap(await api.checkoutPullRequest(id, number, revision)),
    mergePr: async (id, number, head) => unwrap(await api.mergePullRequest(id, number, head)),
    hooks: { preferences: { getSnapshot: () => gitForm.getSnapshot(), subscribe: listener => gitForm.subscribe(listener) } },
    setPreference: (field, value) => gitForm.set(field, value),
    notify: (text, success) => {
      notice.set({ text, success, sequence: ++sequence })
    },
  }
  const t = ctx.locale.bind('settings.git')
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      { name: 'settings.section', id: 'git', order: 45, label: () => t('nav'), locale: 'settings.git', inject: () => actions },
      GitPage,
    ),
  )
  function GitNotice({
    useNotice,
  }: PropsRuntime<'shell.overlay'> &
    InjectFace<{ hooks: { notice: ObservableSnapshot<ReturnType<typeof notice.getSnapshot>> } }>) {
    const current = useNotice(value => value)
    return current
      ? createElement(Toast, {
        key: current.sequence,
        text: current.text,
        ...(current.success ? { tone: 'success' as const } : {}),
        onDone: () => {
          notice.set(null)
        },
      })
      : null
  }
  ctx.inject(['remote.codeReview', 'uiWorkspace'], (child) => {
    const reviewForm = child.configForms.get<ReviewPreferences>('code-review-controller')
    const reviewActions: ReviewPageActions = {
      workspaces: actions.workspaces,
      hooks: {
        preferences: { getSnapshot: () => reviewForm.getSnapshot(), subscribe: listener => reviewForm.subscribe(listener) },
      },
      mutatePreferences: ops => reviewForm.mutate(ops),
      start: async (request, signal) =>
        unwrap(
          await child.remote.codeReview.start(
            { ...request, language: child.locale.getSnapshot().active.startsWith('zh') ? 'zh' : 'en' },
            signal,
          ),
        ),
      open: (id) => {
        child.uiWorkspace.openSession(id)
      },
      notify: actions.notify,
    }
    child.slots.inject('settings.section', () =>
      child.slots.register(
        {
          name: 'settings.section',
          id: 'code-review',
          order: 46,
          label: () => t('review'),
          locale: 'settings.git',
          inject: () => reviewActions,
        },
        ReviewPage,
      ),
    )
  })
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({ name: 'shell.overlay', id: 'git.notice', inject: () => ({ hooks: { notice } }) }, GitNotice),
  )
}
