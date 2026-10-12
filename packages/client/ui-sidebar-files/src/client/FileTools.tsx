/** Shared native-style file menu; all service access is injected by the plugin. */
import { useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { writeClipboard, Menu, Modal, Tooltip, IconCopyOutlineRegular, IconSearchOutlineRegular, IconFolderOpenRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { FileActions } from './file-actions.ts'
import { fileName, parentFilePath, relativeFilePath } from './file-actions.ts'
import { childPath } from './face.ts'
import css from './FileTools.module.css'

type Target = { path: string; directory: boolean }
type Dialog = { action: string; target: Target }

/** Tree wrapper or preview toolbar, using identical path and file operations. */
export function FileTools({ root, path, fileActions, t, children, onChanged }: {
  root: string
  path?: string
  fileActions: FileActions
  t: TranslateNS<'sidebarFiles'>
  children?: ReactNode
  onChanged?: () => void
}): ReactNode {
  const [menu, setMenu] = useState<{ target: Target; x: number; y: number }>()
  const [dialog, setDialog] = useState<Dialog>()
  const [value, setValue] = useState('')
  const [content, setContent] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [results, setResults] = useState<Awaited<ReturnType<FileActions['search']>>>()
  const selected = useRef<Target>({ path: root, directory: true })
  const chord = useRef(0)
  const toolbar = path !== undefined
  const target = menu?.target ?? { path: path ?? root, directory: !toolbar }
  const close = (): void => { if (!busy) { setDialog(undefined); setResults(undefined) } }
  const report = (error: unknown): void => {
    const raw = error instanceof Error ? error.message : String(error)
    const text = raw.includes('FILE_ENTRY_EXISTS') ? t('files.exists') : raw.includes('FILE_ENTRY_LOCAL_ONLY') ? t('files.localOnly') : raw
    setNotice(text)
    if (dialog === undefined) fileActions.notify(text)
  }
  const run = async (action: string, chosen: Target): Promise<void> => {
    setMenu(undefined); setNotice('')
    try {
      if (['copy-path', 'copy-relative', 'copy-name', 'copy', 'cut'].includes(action)) {
        const text = action === 'copy-relative' ? relativeFilePath(root, chosen.path) : action === 'copy-name' ? fileName(chosen.path) : chosen.path
        if (!await writeClipboard(text)) throw new Error(t('files.copyFailed'))
        if (action === 'copy' || action === 'cut') fileActions.remember(chosen.path, action === 'cut')
        else fileActions.clearClipboard()
        fileActions.notify(t('files.copied')); return
      }
      if (action === 'open') { fileActions.open(chosen.path); return }
      if (action === 'reveal') { await fileActions.reveal(chosen.path); return }
      if (action === 'locate') { fileActions.locate(chosen.path); return }
      if (action === 'add') { fileActions.add(chosen.path, chosen.directory); return }
      if (action === 'terminal') { await fileActions.terminal(chosen.directory ? chosen.path : parentFilePath(chosen.path)); return }
      if (action === 'paste' && fileActions.clipboard() === undefined) return
      setValue(action === 'rename' ? fileName(chosen.path) : action === 'paste' ? fileName(fileActions.clipboard()?.path ?? '') : '')
      setResults(undefined); setDialog({ action, target: chosen })
    } catch (error) { report(error) }
  }
  const submit = async (): Promise<void> => {
    if (dialog === undefined || busy) return
    setBusy(true); setNotice('')
    try {
      const { action, target: chosen } = dialog
      const directory = chosen.directory ? chosen.path : parentFilePath(chosen.path)
      if (action === 'search') { setResults(await fileActions.search(directory, value, content)); return }
      if (action !== 'trash' && (!value.trim() || /[\\/<>:"|?*\u0000-\u001f]/u.test(value) || /[. ]$/u.test(value) || ['.', '..'].includes(value))) throw new Error(t('files.invalidName'))
      if (action === 'paste') {
        const clip = fileActions.clipboard()
        if (clip === undefined) return
        await fileActions.change({ operation: clip.cut ? 'move' : 'copy', path: clip.path, destination: childPath(directory, value) })
        if (clip.cut) fileActions.clearClipboard()
      } else if (action === 'rename') {
        await fileActions.change({ operation: 'rename', path: chosen.path, destination: childPath(parentFilePath(chosen.path), value) })
      } else if (action === 'trash') await fileActions.change({ operation: 'trash', path: chosen.path })
      else if (action === 'new-file' || action === 'new-folder') await fileActions.change({ operation: action, path: childPath(directory, value) })
      setDialog(undefined); onChanged?.(); fileActions.notify(t('files.done'))
    } catch (error) { report(error) } finally { setBusy(false) }
  }
  const item = (id: string, shortcut?: string[], disabled = false): MenuEntry => ({
    id, label: t(`files.${id}` as Parameters<typeof t>[0]), disabled,
    ...(id === 'trash' ? { danger: true } : {}), ...(shortcut === undefined ? {} : { shortcut: { keys: shortcut } }),
  })
  const protectedRoot = relativeFilePath(root, target.path) === '.'
  const items: MenuEntry[] = toolbar
    ? [item('copy-path', ['Shift', 'Alt', 'C']), item('copy-relative', ['Ctrl', 'Shift', 'C']), item('copy-name')]
    : [item('new-file'), item('new-folder'), { type: 'separator', id: 'creation' },
      item('open', undefined, target.directory), item('reveal', ['Shift', 'Alt', 'R']), item('terminal'), item('search', ['Shift', 'Alt', 'F']), item('add'),
      { type: 'separator', id: 'operations' }, item('cut', ['Ctrl', 'X'], protectedRoot), item('copy', ['Ctrl', 'C'], protectedRoot), item('paste', ['Ctrl', 'V'], fileActions.clipboard() === undefined),
      { type: 'separator', id: 'paths' }, item('copy-path', ['Shift', 'Alt', 'C']), item('copy-relative', ['Ctrl', 'Shift', 'C']),
      { type: 'separator', id: 'mutations' }, item('rename', ['F2'], protectedRoot), item('trash', ['Del'], protectedRoot)]
  const targetFrom = (element: EventTarget): Target => {
    const row = element instanceof Element ? element.closest<HTMLElement>('[data-files-entry]') : null
    return row?.dataset.filesPath ? { path: row.dataset.filesPath, directory: row.dataset.filesEntry === 'directory' } : { path: root, directory: true }
  }
  const keyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.target as Node)) return
    if (event.nativeEvent.isComposing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
    const primary = event.ctrlKey || event.metaKey
    if (primary && event.code === 'KeyK') { chord.current = Date.now(); event.preventDefault(); event.stopPropagation(); return }
    let action: string | undefined
    if (event.shiftKey && event.altKey && event.code === 'KeyC') action = 'copy-path'
    else if (event.shiftKey && event.altKey && event.code === 'KeyR') action = 'reveal'
    else if (event.shiftKey && event.altKey && event.code === 'KeyF') action = 'search'
    else if (primary && event.shiftKey && event.code === 'KeyC') action = 'copy-relative'
    else if (primary && !event.altKey && !event.shiftKey) action = ({ KeyC: 'copy', KeyX: 'cut', KeyV: 'paste' } as Record<string, string>)[event.code]
    else if (!primary && !event.altKey && !event.shiftKey) action = ({ F2: 'rename', Delete: 'trash', ContextMenu: 'menu' } as Record<string, string>)[event.code]
    if (event.shiftKey && event.code === 'F10') action = 'menu'
    if (action === undefined) return
    event.preventDefault(); event.stopPropagation(); chord.current = 0
    const chosen = selected.current
    if (relativeFilePath(root, chosen.path) === '.' && ['rename', 'trash', 'cut', 'copy'].includes(action)) return
    if (action === 'menu') {
      const rect = (event.target as HTMLElement).getBoundingClientRect(); setMenu({ target: chosen, x: rect.left, y: rect.bottom })
    } else void run(action, chosen)
  }
  const button = (action: string, icon: ReactNode): ReactNode => <Tooltip label={t(`files.${action}` as Parameters<typeof t>[0])} side="bottom"><button type="button" className={css.tool} aria-label={t(`files.${action}` as Parameters<typeof t>[0])} onClick={() => { void run(action, target) }}>{icon}</button></Tooltip>
  return <div className={toolbar ? css.toolbar : css.wrapper} onKeyDown={toolbar ? undefined : keyDown}
    onFocus={toolbar ? undefined : (event) => {
      if (event.currentTarget.contains(event.target)) selected.current = targetFrom(event.target)
    }}
    onContextMenu={toolbar ? undefined : (event) => {
      if (!event.currentTarget.contains(event.target as Node)) return
      event.preventDefault(); event.stopPropagation()
      const chosen = targetFrom(event.target)
      selected.current = chosen; setMenu({ target: chosen, x: event.clientX, y: event.clientY })
    }}>
    {children}
    <Menu portal autoFocus open={menu !== undefined} items={items} onClose={() => { setMenu(undefined) }}
      onSelect={(id) => { void run(id, target) }}
      getAnchorRect={() => menu === undefined ? null : new DOMRect(menu.x, menu.y, 0, 0)}
      anchor={toolbar ? <button type="button" className={css.tool} aria-label={t('files.copyMenu')} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ target, x: rect.left, y: rect.bottom }) }}><IconCopyOutlineRegular /></button> : <span />} />
    {toolbar && <>{button('locate', <IconSearchOutlineRegular />)}{button('add', <span>＋</span>)}{button('reveal', <IconFolderOpenRegular />)}</>}
    <Modal open={dialog !== undefined} title={dialog === undefined ? '' : t(`files.${dialog.action}` as Parameters<typeof t>[0])} closeLabel={t('files.cancel')} onClose={close}
      footer={<><button type="button" disabled={busy} onClick={close}>{t('files.cancel')}</button><button type="button" disabled={busy || (dialog?.action !== 'trash' && value.trim() === '')} onClick={() => { void submit() }}>{busy ? t('loading') : t('files.confirm')}</button></>}>
      <p className={css.path}>{dialog?.target.path}</p>
      {dialog?.action === 'trash' ? <p>{t('files.trashHint')}</p> : <input className={css.input} data-modal-autofocus aria-label={t(dialog?.action === 'search' ? 'files.query' : 'files.name')} value={value} onChange={(event) => { setValue(event.target.value) }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void submit() } }} />}
      {dialog?.action === 'paste' && <p>{t('files.noOverwrite')}</p>}
      {dialog?.action === 'search' && <label><input type="checkbox" checked={content} onChange={(event) => { setContent(event.target.checked) }} />{t('files.searchContent')}</label>}
      {notice && <p role="alert">{notice}</p>}
      {results && <div className={css.results}>{results.matches.length === 0 && <p>{t('files.noResults')}</p>}{results.matches.map((match, index) => <button type="button" key={index} onClick={() => { if (match.line === 0) fileActions.locate(match.path); else fileActions.open(match.path, match.line); close() }}><span>{relativeFilePath(root, match.path)}{match.line > 0 ? `:${match.line}` : ''}</span><small>{match.text}</small></button>)}{results.truncated && <p>{t('truncated')}</p>}</div>}
    </Modal>
  </div>
}
