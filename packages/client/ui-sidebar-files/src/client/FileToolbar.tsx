/** Preview header actions reuse the same commands as file-tree rows. */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import type { FileActions } from './file-actions.ts'
import { FileTools } from './FileTools.tsx'

/** File preview toolbar: copy paths, locate, add reference and reveal. */
export function FileToolbar({ absolutePath, sessionId, useSessions, fileActions, t }:
  PropsRuntime<'sidebar.right.tab.document.actions'> & PropsLocale<'sidebarFiles'> & { fileActions: FileActions }) {
  const root = useSessions(state => state.byId[sessionId]?.cwd) ?? ''
  return <FileTools root={root} path={absolutePath} fileActions={fileActions} t={t} />
}
