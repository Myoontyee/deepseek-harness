/** All paired computers remain visibly separated by device and connection state. */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { IconGlobeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeviceActions } from './devices.ts'

/** @param props - Device state and native commands. @returns The paired conversation hub. */
export function DevicesPage({ useDevices, deviceCommand, watchDevices, t }: PropsRuntime<'main'> & PropsLocale<'settings.connections'> & InjectFace<DeviceActions>) {
  const state = useDevices(value => value)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [pairing, setPairing] = useState(false)
  const [search, setSearch] = useState('')
  useEffect(watchDevices, [watchDevices])
  return <section className="dsh-connections dsh-device-hub">
    <h2>{t('devices.title')}</h2><p>{t('devices.hint')}</p>
    <fieldset disabled={state.busy}>
      <label className="check"><input type="checkbox" checked={state.catalog.detect}
        onChange={(event) => { void deviceCommand('detect', { enabled: event.target.checked }) }} />{t('devices.detect')}</label>
      <div className="actions"><button onClick={() => { void deviceCommand('refresh') }}>{t('refresh')}</button>
        <button onClick={() => { void deviceCommand('invitation') }}>{t('devices.invite')}</button></div>
      {state.catalog.warning && <p role="status">{state.catalog.warning}</p>}
      {state.catalog.detect && <section className="dsh-device-inventory" aria-label={t('devices.nearby')}>
        <div className="dsh-device-inventory-heading"><h3>{t('devices.nearby')}</h3></div>
        {state.catalog.peers.length === 0 ? <p className="dsh-device-empty">{t('devices.noneFound')}</p> :
          <table className="dsh-device-table">
            <thead><tr><th scope="col">{t('devices.name')}</th><th scope="col">{t('devices.address')}</th>
              <th scope="col">{t('devices.system')}</th><th scope="col">{t('devices.status')}</th><th scope="col">{t('devices.action')}</th></tr></thead>
            <tbody>{state.catalog.peers.map((peer) => {
              const paired = state.catalog.paired.find(device => device.address === peer.address)
              const connected = paired !== undefined && state.sessions[paired.id] !== undefined && !state.failures[paired.id]
              return <tr key={peer.id}>
                <th scope="row"><span className="dsh-device-name"><IconGlobeOutlineRegular size={18} /><span>{peer.name}</span></span></th>
                <td data-label={t('devices.address')}><code>{peer.address}</code></td>
                <td data-label={t('devices.system')}>{peer.os}</td>
                <td data-label={t('devices.status')}><span className="dsh-device-status" data-online={peer.self || connected || peer.online}>
                  <span className="dsh-device-status-dot" aria-hidden="true" />
                  {peer.self ? t('devices.self') : connected ? t('devices.connected') : peer.online ? t('devices.online') : t('devices.offline')}
                </span></td>
                <td data-label={t('devices.action')} className="dsh-device-actions">
                  {peer.self ? <span className="dsh-device-muted">{t('devices.self')}</span> : paired ?
                    <span className="dsh-device-muted">{t('devices.paired')}</span> :
                    <button onClick={() => { setName(peer.name); setPairing(true) }}>{t('devices.choose')}</button>}
                </td>
              </tr>
            })}</tbody>
          </table>}
      </section>}
      <details open={pairing} onToggle={(event) => { setPairing(event.currentTarget.open) }}><summary>{t('devices.pair')}</summary><p>{t('devices.pairHint')}</p>
        <label>{t('devices.name')}<input value={name} maxLength={200} onChange={(event) => { setName(event.target.value) }} /></label>
        <label>{t('devices.code')}<textarea value={code} maxLength={4096} autoComplete="off" spellCheck={false} onChange={(event) => { setCode(event.target.value) }} /></label>
        <button disabled={!name.trim() || !code.trim()} onClick={() => {
          void deviceCommand('pair', { name: name.trim(), code: code.trim() }).then((ok) => { if (ok) { setCode(''); setPairing(false) } })
        }}>{t('devices.pair')}</button>
      </details>
    </fieldset>
    {state.error && <p role="alert" className="error">{state.error}</p>}
    <label>{t('devices.search')}<input value={search} onChange={(event) => { setSearch(event.target.value) }} /></label>
    {state.catalog.paired.length === 0 && <p>{t('devices.empty')}</p>}
    {state.catalog.paired.map(device => <section className="card" key={device.id}>
      <h3><IconGlobeOutlineRegular size={18} /> {device.name} · {state.failures[device.id] ? t('devices.offline') : t('devices.connected')}</h3>
      {state.failures[device.id] && <p role="status">{state.failures[device.id]}</p>}
      {(state.sessions[device.id] ?? []).filter(row => row.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(row =>
        <button className="dsh-device-session" key={row.id} title={device.name}
          onClick={() => { void deviceCommand('open', { id: device.id, sessionId: row.id }) }}>
          <span><IconGlobeOutlineRegular size={16} /> {row.title}</span><span>{row.running ? '● ' : ''}{device.name}</span>
        </button>)}
      <button disabled={state.busy} onClick={() => { void deviceCommand('forget', { id: device.id }) }}>{t('devices.forget')}</button>
    </section>)}
  </section>
}
/** @param props - Sidebar icon sizing. @returns The devices entry glyph. */
export function DevicesIcon({ size }: PropsRuntime<'sidebar.panellist'>) { return <IconGlobeOutlineRegular size={size} /> }
