/** Bind explicit file gestures to the session-scoped services. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import type {} from '@deepseek-ai/dsh-api-terminal-controller/remote'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-terminal/client'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type { FileActions } from './file-actions.ts'
import { fileName } from './file-actions.ts'

/**
 * Share the file clipboard for this plugin lifetime, without changing the OS file clipboard.
 * @param ctx - Injected client services.
 * @param notify - Shell-owned outcome notification.
 * @returns Per-session file actions.
 */
export function createFileActions(ctx: Context, notify: (text: string) => void): (sessionId: SessionId) => FileActions {
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() })
  let clipboard: { path: string; cut: boolean; sessionId: SessionId } | undefined
  return (sessionId) => {
    const root = (): string | undefined => ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
    return {
      notify,
      async change(request) {
        const result = await ctx.remote.workspaceFiles.changeEntry(sessionId, request, lifetime.signal)
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
      async search(directory, query, content) {
        const result = await ctx.remote.workspaceFiles.searchEntries(sessionId, directory, query, content, lifetime.signal)
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
      async reveal(path) {
        const result = await ctx.remote.session.openWorkspacePath({ path, action: 'reveal' }, lifetime.signal)
        if (!result.ok) throw new Error(result.error.message)
      },
      open(path, line) {
        ctx.sidebarRight.openResourceIn(sessionId, fileAddressFor(sessionId, root(), path), line === undefined ? {} : { params: { line } })
      },
      locate(path) { ctx.sidebarRight.openTabIn(sessionId, 'files', { params: { revealPath: path } }) },
      add(path, directory) {
        const scope = ctx.sessions.scope(sessionId)
        if (scope === undefined) throw new Error('Session is unavailable')
        const conversation = scope.get('conversation')
        if (conversation === undefined) throw new Error('Conversation input is unavailable')
        const input = conversation.input.for(scope)
        const state = input.state.getSnapshot()
        // Insertion spans use the detection projection: a chip occupies one character.
        const length = state.draft.length - state.occurrences.reduce((sum, ref) => sum + ref.clipboardText.length - 1, 0)
        const mention = '@"' + path.replace(/\\/gu, '/') + '"'
        if (!input.insertReference({ source: 'reference', ref: mention, label: fileName(path), appearance: directory ? 'folder' : 'file', clipboardText: mention }, { start: length, end: length, draftRev: state.draftRev })) throw new Error('Input is busy; try again after sending completes')
        input.focus()
      },
      async terminal(path) {
        const id = randomUUID() as WebTerminalId
        const result = await ctx.remote.terminal.create(sessionId, { id, cwd: path, cols: 100, rows: 30 }, lifetime.signal)
        if (!result.ok) throw new Error(result.error.message)
        ctx.sidebarRight.openTabIn(sessionId, 'terminal', { params: { terminalId: id } })
      },
      clipboard: () => clipboard?.sessionId === sessionId ? clipboard : undefined,
      remember(path, cut) { clipboard = { path, cut, sessionId } },
      clearClipboard() { clipboard = undefined },
    }
  }
}
