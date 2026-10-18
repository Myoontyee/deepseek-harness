/** Compact connection cards with per-computer refresh and advanced pairing controls. */
import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { Button, Switch, StateDot, IconGlobeOutlineRegular, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeviceActions } from './devices.ts'
import css from './devices.module.css'

/** @param props - Device state and native commands. @returns The paired computer manager. */
export function DevicesPage({ useDevices, deviceCommand, watchDevices, maskPhoneText: mask, t }:
PropsLocale<'settings.connections'> & InjectFace<DeviceActions>) {
  const state = useDevices(value => value)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [pairing, setPairing] = useState(false)
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
  const locked = state.busy || pending !== null
  return <section className={css.page}>
    <div className={css.toolbar}><h2>{t('nav')}</h2><div className={css.actions}>
      <Button variant="outline" disabled={locked} onClick={() => { void deviceCommand('refresh') }}>{t('refresh')}</Button>
      <Button variant="primary" disabled={locked} onClick={() => { void deviceCommand('invitation') }}>{t('devices.invite')}</Button>
    </div></div>
    <p>{t('devices.sidebarHint')}</p>
    {pending && <div role="status"><p>{t(`devices.${pending.phase}`)} {pending.name}</p>
      {pending.phase === 'awaiting' && <Button variant="outline" onClick={() => { void deviceCommand('cancelPairTailnet') }}>{t('cancel')}</Button>}
    </div>}
    {state.error && <p role="alert" className={css.error}>{state.error}</p>}
    <h3>{t('devices.saved')}</h3>
    {state.catalog.paired.length === 0 ? <p>{t('devices.empty')}</p> : <div className={css.card}>
      {state.catalog.paired.map((device) => {
        const failed = state.failures[device.id]
        const loading = state.refreshing?.[device.id]
        const ready = state.sessions[device.id] !== undefined
        const updated = state.updatedAt?.[device.id]
        return <section key={device.id} aria-label={device.name}>
          <div className={css.row}>
            <div className={css.identity}>
              <div className={css.name}><IconGlobeOutlineRegular size={18} /><span>{device.name}</span></div>
              <div className={css.status}><StateDot state={loading ? 'ongoing' : failed ? 'error' : ready ? 'done' : 'idle'} />
                {loading ? t('pending') : failed ? t('devices.offline') : ready ? t('devices.connected') : t('devices.paired')}
                {ready && !failed && <span> · {t('devices.catalogCount', {
                  workspaces: state.workspaces?.[device.id]?.length ?? 0, sessions: state.sessions[device.id]?.length ?? 0,
                })}</span>}
              </div>
            </div>
            <div className={css.actions}><Button variant="outline" disabled={locked || loading}
              onClick={() => { void deviceCommand('refreshDevice', { id: device.id }) }}>
              {failed ? t('devices.reconnect') : t('devices.refreshConversations')}
            </Button></div>
          </div>
          <details className={css.details}><summary>{t('devices.details')}</summary>
            <p>{t('devices.address')} · {device.address}</p>
            {updated && <p>{t('devices.updated')} · {new Date(updated).toLocaleString()}</p>}
            {failed && <p role="status" className={css.error}>{failed}</p>}
            {state.warnings?.[device.id] && <p role="status">{state.warnings[device.id]}</p>}
            <Button variant="ghost" disabled={locked} onClick={() => { void deviceCommand('forget', { id: device.id }) }}>{t('devices.forget')}</Button>
          </details>
        </section>
      })}
    </div>}
    <div className={css.toolbar}><h3>{t('devices.nearby')}</h3><Switch checked={state.catalog.detect}
      disabled={locked} label={t('devices.detect')} onChange={(enabled) => { void deviceCommand('detect', { enabled }) }} /></div>
    {state.catalog.warning && <p role="status">{state.catalog.warning}</p>}
    {state.catalog.detect && <div className={css.card}>
      {state.catalog.peers.length === 0 && <div className={css.row}><p>{t('devices.noneFound')}</p></div>}
      {state.catalog.peers.map((peer) => {
        const paired = state.catalog.paired.some(device => device.address === peer.address)
        const phone = /^(android|ios)$/iu.test(peer.os)
        return <div className={css.row} key={peer.id} role="group" aria-label={peer.name}>
          <div className={css.identity}>
            <div className={css.name}><IconGlobeOutlineRegular size={18} /><span>{peer.name}</span></div>
            <div className={css.status}><StateDot state={peer.online ? 'done' : 'idle'} />
              {peer.os} · {peer.self ? t('devices.self') : paired ? t('devices.paired') : peer.online ? t('devices.online') : t('devices.offline')}
            </div>
          </div>
          <div className={css.actions}>{peer.self ? <span className={css.muted}>{t('devices.self')}</span> : paired ?
            <span className={css.muted}>{t('devices.paired')}</span> : phone ? <span className={css.muted}>{t('devices.fromPhone')}</span> :
              <Button variant="outline" disabled={locked || !peer.online} onClick={() => { void connect(peer.id, peer.name) }}>{t('devices.choose')}</Button>}
          </div>
        </div>
      })}
    </div>}
    <details className="dsh-connections" open={pairing} onToggle={(event) => { setPairing(event.currentTarget.open) }}>
      <summary>{t('devices.pair')}</summary><p>{t('devices.pairHint')}</p>
      <fieldset disabled={locked}>
        <label>{t('devices.name')}<input value={name} maxLength={200} onChange={(event) => { setName(event.target.value) }} /></label>
        <label>{t('devices.code')}<textarea value={code} maxLength={4096} autoComplete="off" spellCheck={false}
          onChange={(event) => { setCode(event.target.value) }} /></label>
        <Button variant="outline" disabled={!name.trim() || !code.trim()} onClick={() => {
          void deviceCommand('pair', { name: name.trim(), code: code.trim() }).then((ok) => { if (ok) { setCode(''); setPairing(false) } })
        }}>{t('devices.pair')}</Button>
      </fieldset>
    </details>
    <details><summary>{t('phone.title')}</summary><p>{t('phone.hint')}</p>
      {state.phones.length === 0 && <p>{t('phone.empty')}</p>}
      {state.phones.map(row => <Button key={row.id} variant="ghost"
        onClick={() => { void deviceCommand('readPhoneConversation', { id: row.id }) }}>{row.title} · {row.device}</Button>)}
      {state.phone && <section>
        <h3>{state.phone.title}</h3><Button variant="ghost" onClick={() => { void deviceCommand('closePhoneConversation') }}>{t('phone.close')}</Button>
        {state.phone.messages.map((turn, index) => <article key={index}>
          <h4>{turn.role === 'user' ? t('phone.user') : turn.model}</h4><MarkdownText text={mask(turn.text)} labels={labels} />
        </article>)}
        <h4>{t('phone.annotations')}</h4>
        {state.phone.annotations.map((note, index) => <article key={index}>
          <blockquote><MarkdownText text={mask(note.quote)} labels={labels} /></blockquote>
          <MarkdownText text={mask(note.comment)} labels={labels} />
        </article>)}
      </section>}
    </details>
  </section>
}
/** @param props - Sidebar icon sizing. @returns The devices entry glyph. */
export function DevicesIcon({ size }: PropsRuntime<'sidebar.panellist'>) { return <IconGlobeOutlineRegular size={size} /> }

/** @param props - Shared connection state. @returns A scrollable main-panel device manager. */
export function DevicesPanel(props: Parameters<typeof DevicesPage>[0]) {
  return <div className={css.panel}><DevicesPage {...props} /></div>
}
