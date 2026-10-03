/** Conversation utilities share the same row identity in ellipsis and context menus. */
import { IconCopyOutlineRegular, IconFolderOpenOutlineRegular, IconLinkOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionMenuItemProps, SessionUtilityInjected } from '../contract/slots.ts'

/**
 * Copy a Desktop link without navigating away from the current conversation.
 * @param props - the row identity, menu state, copy operation, and locale seat.
 * @returns the link-copy menu item.
 */
export function CopySessionLinkMenuItem({
  sessionId, useMenuOpenState, copySessionLink, t,
}: SessionMenuItemProps<SessionUtilityInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  return <MenuItemButton separatorBefore icon={<IconLinkOutlineRegular />} onSelect={() => { setMenuOpen(false); copySessionLink(sessionId) }}>{t('menu.copyLink')}</MenuItemButton>
}

/**
 * Copy all committed human and assistant messages as Markdown.
 * @param props - the row identity, menu state, export operation, and locale seat.
 * @returns the Markdown-copy menu item.
 */
export function CopySessionMarkdownMenuItem({
  sessionId, displayTitle, useMenuOpenState, copySessionMarkdown, t,
}: SessionMenuItemProps<SessionUtilityInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  return <MenuItemButton icon={<IconCopyOutlineRegular />} onSelect={() => { setMenuOpen(false); copySessionMarkdown(sessionId, displayTitle) }}>{t('menu.copyMarkdown')}</MenuItemButton>
}

/**
 * Copy the real Session cwd, including a worktree cwd when applicable.
 * @param props - the Session snapshot hook, menu state, copy operation, and locale seat.
 * @returns the directory-copy menu item, disabled without a known cwd.
 */
export function CopySessionDirectoryMenuItem({
  sessionId, useSessions, useMenuOpenState, copySessionDirectory, t,
}: SessionMenuItemProps<SessionUtilityInjected>) {
  const path = useSessions(state => state.byId[sessionId]?.cwd)
  const [, setMenuOpen] = useMenuOpenState()
  return <MenuItemButton separatorBefore disabled={path === undefined} icon={<IconCopyOutlineRegular />} onSelect={() => { if (path === undefined) return; setMenuOpen(false); copySessionDirectory(path) }}>{t('menu.copyDirectory')}</MenuItemButton>
}

/**
 * Open the real Session cwd through the existing Host capability.
 * @param props - the Session snapshot hook, menu state, Host operation, and locale seat.
 * @returns the open-directory menu item, disabled without a known cwd.
 */
export function OpenSessionDirectoryMenuItem({
  sessionId, useSessions, useMenuOpenState, openSessionDirectory, t,
}: SessionMenuItemProps<SessionUtilityInjected>) {
  const path = useSessions(state => state.byId[sessionId]?.cwd)
  const [, setMenuOpen] = useMenuOpenState()
  return <MenuItemButton disabled={path === undefined} icon={<IconFolderOpenOutlineRegular />} onSelect={() => { if (path === undefined) return; setMenuOpen(false); openSessionDirectory(path) }}>{t('menu.openDirectory')}</MenuItemButton>
}

/**
 * Open the addressed Session in a Desktop window without navigating this window.
 * @param props - Row identity, Desktop operation, menu state, and locale seat.
 * @returns The Desktop-only window action.
 */
export function OpenSessionWindowMenuItem({
  sessionId, useMenuOpenState, openSessionWindow, t,
}: SessionMenuItemProps<SessionUtilityInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  if (openSessionWindow === undefined) return null
  return <MenuItemButton separatorBefore icon={<IconCopyOutlineRegular />} onSelect={() => { setMenuOpen(false); openSessionWindow(sessionId) }}>{t('menu.openWindow')}</MenuItemButton>
}
