/** Paired computer folders participate in the existing sidebar scroll and search. */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconFolderCloseRegular, IconGlobeOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeviceActions } from './devices.ts'
import css from './devices.module.css'

/** @param props - Remote display catalog and the workspace browser's filters. @returns Device folders and conversations. */
export function RemoteWorkspaces({ useDevices, deviceCommand, watchDevices, query, archivedFilter, t }:
Pick<PropsRuntime<'sidebar.workspaces.remote'>, 'query' | 'archivedFilter'> & PropsLocale<'settings.connections'> & InjectFace<DeviceActions>) {
  const state = useDevices(value => value)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [more, setMore] = useState<Record<string, boolean>>({})
  useEffect(watchDevices, [watchDevices])
  if (state.catalog.paired.length === 0) return null
  const search = query.toLocaleLowerCase()
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
      return <section key={device.id} className={css.remoteDevice}>
        <div className={css.deviceHeading}>
          <button className={css.headingButton} aria-expanded={!collapsed[device.id]}
            onClick={() => { setCollapsed(value => ({ ...value, [device.id]: !value[device.id] })) }}>
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
              onClick={() => { setExpanded(value => ({ ...value, [key]: !value[key] })) }}>
              <IconFolderCloseRegular size={18} /><span>{workspace.title || t('devices.otherConversations')}</span>
              <Tooltip label={`${device.name} · ${workspace.path}`}><span className={css.globe}><IconGlobeOutlineRegular size={14} /></span></Tooltip>
            </button>
            {opened && <div className={css.conversations}>
              {(more[key] ? rows : rows.slice(0, 5)).map(row => <button key={row.id} className={css.conversation}
                disabled={offline || state.busy} onClick={() => { void deviceCommand('open', { id: device.id, sessionId: row.id }) }}>
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
  </section>
}
