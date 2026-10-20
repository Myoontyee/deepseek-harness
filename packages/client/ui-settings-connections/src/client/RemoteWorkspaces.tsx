/** Paired computer folders participate in the existing sidebar scroll and search. */
import { useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button, IconFolderCloseRegular, IconGlobeOutlineRegular, Input, Menu, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeviceActions } from './devices.ts'
import css from './devices.module.css'

interface ContextTarget { x: number; y: number; deviceId: string; workspaceId?: string; workspacePath?: string }
interface AddTarget { deviceId: string; path: string; attempted: boolean }

/** @param props - Remote display catalog and the workspace browser's filters. @returns Device folders and conversations. */
export function RemoteWorkspaces({ useDevices, deviceCommand, watchDevices, query, archivedFilter, t }:
Pick<PropsRuntime<'sidebar.workspaces.remote'>, 'query' | 'archivedFilter'> & PropsLocale<'settings.connections'> & InjectFace<DeviceActions>) {
  const state = useDevices(value => value)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [more, setMore] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useState<ContextTarget>()
  const [adding, setAdding] = useState<AddTarget>()
  useEffect(watchDevices, [watchDevices])
  if (state.catalog.paired.length === 0) return null
  const search = query.toLocaleLowerCase()
  const openMenu = (event: MouseEvent, target: Omit<ContextTarget, 'x' | 'y'>): void => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ ...target, x: event.clientX, y: event.clientY })
  }
  const selectMenu = (id: string): void => {
    const target = menu
    setMenu(undefined)
    if (target === undefined) return
    if (id === 'conversation' && target.workspaceId !== undefined) {
      void deviceCommand('createConversation', { id: target.deviceId, workspaceId: target.workspaceId })
    } else if (id === 'workspace') {
      setAdding({ deviceId: target.deviceId, path: '', attempted: false })
    } else if (id === 'refresh') {
      void deviceCommand('refreshDevice', { id: target.deviceId })
    }
  }
  const submitWorkspace = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (adding === undefined) return
    const path = adding.path.trim()
    if (path === '') return
    setAdding({ ...adding, attempted: true })
    const saved = await deviceCommand('createWorkspace', { id: adding.deviceId, path })
    if (saved) setAdding(undefined)
  }
  return <section className={css.sidebar} aria-label={t('devices.remoteWorkspaces')} data-row-key="remote-workspaces">
    {state.catalog.paired.map((device) => {
      const offline = Boolean(state.failures[device.id])
      const workspaces = state.workspaces?.[device.id] ?? []
      const sessions = (state.sessions[device.id] ?? []).filter(row =>
        archivedFilter === 'only' ? row.archived : archivedFilter === 'show' || !row.archived)
      const folders = workspaces.filter(workspace => !search ||
        `${device.name} ${workspace.title} ${workspace.path}`.toLocaleLowerCase().includes(search) ||
        sessions.some(row => row.workspaceId === workspace.id && row.title.toLocaleLowerCase().includes(search)))
      if (search && folders.length === 0) return null
      return <section key={device.id} className={css.remoteDevice}
        onContextMenu={(event) => { openMenu(event, { deviceId: device.id }) }}>
        <div className={css.deviceHeading}>
          <button className={css.headingButton} aria-expanded={!collapsed[device.id]}
            onClick={() => { setCollapsed(value => ({ ...value, [device.id]: !value[device.id] })) }}
            onContextMenu={(event) => { openMenu(event, { deviceId: device.id }) }}>
            <IconGlobeOutlineRegular size={14} /><span>{device.name}</span>
          </button>
          <Tooltip label={offline ? t('devices.reconnect') : t('devices.refreshConversations')}>
            <button className={css.smallAction} disabled={state.refreshing?.[device.id]}
              aria-label={`${offline ? t('devices.reconnect') : t('devices.refreshConversations')} · ${device.name}`}
              onClick={() => { void deviceCommand('refreshDevice', { id: device.id }) }}>
              {offline ? t('devices.reconnect') : t('refresh')}
            </button>
          </Tooltip>
        </div>
        {offline && <span className={css.offline}>{t('devices.offline')}</span>}
        {!collapsed[device.id] && folders.map((workspace) => {
          const key = `${device.id}/${workspace.id}`
          const workspaceMatch = `${device.name} ${workspace.title} ${workspace.path}`.toLocaleLowerCase().includes(search)
          const rows = sessions.filter(row => row.workspaceId === workspace.id &&
            (!search || workspaceMatch || row.title.toLocaleLowerCase().includes(search)))
          const opened = expanded[key] || Boolean(search)
          return <div key={key}>
            <button className={css.folder} aria-expanded={opened}
              onClick={() => { setExpanded(value => ({ ...value, [key]: !value[key] })) }}
              onContextMenu={(event) => {
                openMenu(event, { deviceId: device.id, workspaceId: workspace.id, workspacePath: workspace.path })
              }}>
              <IconFolderCloseRegular size={18} /><span>{workspace.title || t('devices.otherConversations')}</span>
              <Tooltip label={`${device.name} · ${workspace.path}`}><span className={css.globe}><IconGlobeOutlineRegular size={14} /></span></Tooltip>
            </button>
            {opened && <div className={css.conversations}>
              {(more[key] ? rows : rows.slice(0, 5)).map(row => <button key={row.id} className={css.conversation}
                disabled={offline || state.busy} onClick={() => { void deviceCommand('open', { id: device.id, sessionId: row.id }) }}
                onContextMenu={(event) => {
                  openMenu(event, { deviceId: device.id, workspaceId: workspace.id, workspacePath: workspace.path })
                }}>
                <span>{row.title}</span>
                <Tooltip label={device.name}><span className={css.globe}><IconGlobeOutlineRegular size={14} /></span></Tooltip>
              </button>)}
              {!more[key] && rows.length > 5 && <button className={css.smallAction}
                onClick={() => { setMore(value => ({ ...value, [key]: true })) }}>{t('devices.showMore')}</button>}
              {rows.length === 0 && <span className={css.muted}>{t('devices.noConversations')}</span>}
            </div>}
          </div>
        })}
        {!collapsed[device.id] && folders.length === 0 && <span className={css.muted}>
          {state.refreshing?.[device.id] ? t('pending') : t('devices.noWorkspaces')}
        </span>}
      </section>
    })}
    {state.error !== '' && <span className={css.error}>{state.error}</span>}
    <Menu open={menu !== undefined} portal compact autoFocus
      anchor={<span className={css.menuAnchor} style={menu === undefined ? undefined : { left: menu.x, top: menu.y }} />}
      getAnchorRect={() => menu === undefined ? null : new DOMRect(menu.x, menu.y, 0, 0)}
      items={menu?.workspaceId === undefined
        ? [{ id: 'workspace', label: t('devices.addProject') }, { id: 'refresh', label: t('devices.refreshConversations') }]
        : [{ id: 'conversation', label: t('devices.newConversation') }, { id: 'workspace', label: t('devices.addProject') }]}
      onSelect={selectMenu} onClose={() => { setMenu(undefined) }} />
    <Modal open={adding !== undefined} onClose={() => { setAdding(undefined) }}
      title={t('devices.addProject')} description={t('devices.addProjectHint')} closeLabel={t('cancel')}
      footer={<>
        <Button onClick={() => { setAdding(undefined) }}>{t('cancel')}</Button>
        <Button variant="primary" type="submit" form="remote-workspace-form"
          disabled={adding === undefined || adding.path.trim() === '' || state.busy}>
          {t('devices.add')}
        </Button>
      </>}>
      <form id="remote-workspace-form" className={css.addForm} onSubmit={(event) => { void submitWorkspace(event) }}>
        <Input autoFocus value={adding?.path ?? ''} placeholder={t('devices.addProjectPlaceholder')}
          onChange={(event) => { if (adding !== undefined) setAdding({ ...adding, path: event.target.value }) }} />
        {adding?.attempted === true && state.error !== '' && <p className={css.error}>{state.error}</p>}
      </form>
    </Modal>
  </section>
}
