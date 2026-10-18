/** All paired computers remain visibly separated by device and connection state. */
import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { IconGlobeOutlineRegular, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeviceActions } from './devices.ts'

/** @param props - Device state and native commands. @returns The paired conversation hub. */
export function DevicesPage({ useDevices, deviceCommand, watchDevices, maskPhoneText: mask, t }:
PropsLocale<'settings.connections'> & InjectFace<DeviceActions>) {
  const state = useDevices(value => value)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [pairing, setPairing] = useState(false)
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<{ name: string; phase: 'contacting' | 'awaiting' } | null>(null)
  const connectionRun = useRef(0)
  const connect = async (id: string, peerName: string): Promise<void> => {
    const run = ++connectionRun.current
    setPending({ name: peerName, phase: 'contacting' })
    try {
      if (!await deviceCommand('probeTailnet', { id }) || connectionRun.current !== run) return
      setPending({ name: peerName, phase: 'awaiting' })
      await deviceCommand('pairTailnet', { id })
    } finally { if (connectionRun.current === run) setPending(null) }
  }
  const labels = { code: { copyLabel: t('phone.copy'), copiedLabel: t('phone.copied') }, footnotes: t('phone.footnotes') }
  useEffect(() => {
    const stop = watchDevices()
    return () => { connectionRun.current++; stop(); void deviceCommand('cancelPairTailnet') }
  }, [watchDevices, deviceCommand])
  return <section className="dsh-connections dsh-device-hub">
    <h2>{t('devices.title')}</h2><p>{t('devices.hint')}</p>
    {pending && <div role="status"><p>{t(`devices.${pending.phase}`)} {pending.name}</p>
      {pending.phase === 'awaiting' && <button onClick={() => { void deviceCommand('cancelPairTailnet') }}>{t('cancel')}</button>}
    </div>}
    <fieldset disabled={state.busy || pending !== null}>
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
                    /^(android|ios)$/iu.test(peer.os) ? <span className="dsh-device-muted">{t('devices.fromPhone')}</span> :
                      <button disabled={!peer.online} onClick={() => { void connect(peer.id, peer.name) }}>{t('devices.choose')}</button>}
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
    <section className="card">
      <h3>{t('phone.title')}</h3><p>{t('phone.hint')}</p>
      {state.phones.length === 0 && <p>{t('phone.empty')}</p>}
      {state.phones.filter(row => row.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(row =>
        <button key={row.id} className="dsh-device-session" onClick={() => { void deviceCommand('readPhoneConversation', { id: row.id }) }}>
          <span>{row.title}</span><span>{row.device} · {new Date(row.updated).toLocaleString()}</span>
        </button>)}
      {state.phone && <section className="dsh-phone-transcript">
        <h3>{state.phone.title}</h3><button onClick={() => { void deviceCommand('closePhoneConversation') }}>{t('phone.close')}</button>
        {state.phone.messages.map((turn, index) => <article key={index}>
          <h4>{turn.role === 'user' ? t('phone.user') : turn.model}</h4>
          <MarkdownText text={mask(turn.text)} labels={labels} />
        </article>)}
        <h4>{t('phone.annotations')}</h4>
        {state.phone.annotations.map((note, index) => <article key={index}>
          <blockquote><MarkdownText text={mask(note.quote)} labels={labels} /></blockquote>
          <MarkdownText text={mask(note.comment)} labels={labels} />
        </article>)}
      </section>}
    </section>
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
