/** Saved SSH target preferences and user-started connection actions. */
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { useEffect, useRef, useState } from 'react'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {
  ConnectionPreferences,
  SshConnectionId,
  SshConnectionList,
  SshProbe,
  SshProfile,
  SshSessionReceipt,
} from '@deepseek-ai/dsh-api-connection-controller/types'
/** Page callbacks and framework-owned live preferences. */
export interface ConnectionActions {
  hooks: { preferences: ObservableSnapshot<ReturnType<ConfigForm<ConnectionPreferences>['getSnapshot']>> }
  list: () => Promise<SshConnectionList>
  save: (id: SshConnectionId, profile: SshProfile | undefined) => Promise<boolean>
  test: (id: SshConnectionId, signal: AbortSignal) => Promise<SshProbe>
  start: (id: SshConnectionId, requestId: string, terminal: boolean, signal: AbortSignal) => Promise<SshSessionReceipt>
  open: (receipt: SshSessionReceipt) => void
}
/** Composed connection settings props. */
export type ConnectionProps = PropsRuntime<'settings.section'> &
  PropsLocale<'settings.connections'> &
  InjectFace<ConnectionActions>
/**
 * Render saved connections and explicit remote-operation entry points.
 * @param props - localized settings, remote callbacks and panel close action.
 * @returns connection settings page.
 */
export function ConnectionsPage({ t, usePreferences, list, save, test, start, open, close }: ConnectionProps) {
  const settings = usePreferences(value => value)
  const [data, setData] = useState<SshConnectionList>({ connections: [], warnings: [] })
  const [id, setId] = useState<SshConnectionId>()
  const [label, setLabel] = useState('')
  const [directory, setDirectory] = useState('')
  const [allow, setAllow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [message, setMessage] = useState('')
  const mounted = useRef(true)
  const active = useRef<AbortController>()
  const pending = useRef<{ key: string; requestId: string }>()
  useEffect(() => {
    let current = true
    mounted.current = true
    list().then(
      (value) => {
        if (current) {
          setData(value)
          setId(value.connections[0]?.id)
        }
      },
      (error: unknown) => {
        if (current) setFailure(String(error))
      },
    )
    return () => {
      current = false
      mounted.current = false
      active.current?.abort()
    }
  }, [list])
  const row = data.connections.find(item => item.id === id)
  const saved = id ? settings.value?.profiles[id] : undefined
  useEffect(() => {
    setLabel(saved?.label ?? row?.label ?? '')
    setDirectory(saved?.directory ?? '')
    setAllow(saved?.allowAgentCommands ?? false)
  }, [id, saved, row])
  useEffect(() => {
    setMessage('')
    setFailure('')
  }, [id])
  const refresh = async () => {
    const value = await list()
    if (mounted.current) {
      setData(value)
      setId(current => (value.connections.some(item => item.id === current) ? current : value.connections[0]?.id))
    }
  }
  const profile = (): SshProfile => {
    if (!row) throw new Error(t('choose'))
    return { alias: row.alias, label: label.trim(), directory: directory.trim(), allowAgentCommands: allow }
  }
  const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (busy) return
    const controller = new AbortController()
    active.current = controller
    setBusy(true)
    setFailure('')
    setMessage('')
    try {
      await operation(controller.signal)
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      if (active.current === controller) active.current = undefined
      if (mounted.current) setBusy(false)
    }
  }
  const persist = async () => {
    if (!id || !row || !settings.writable || !(await save(id, profile()))) throw new Error(t('readOnly'))
  }
  const begin = async (terminal: boolean, signal: AbortSignal) => {
    if (!id) return
    await persist()
    signal.throwIfAborted()
    const key = JSON.stringify([id, profile(), terminal])
    if (pending.current?.key !== key) pending.current = { key, requestId: randomUUID() }
    const receipt = await start(id, pending.current.requestId, terminal, signal)
    signal.throwIfAborted()
    pending.current = undefined
    open(receipt)
    close()
  }
  return (
    <section className="dsh-connections">
      <h2>{t('title')}</h2>
      <p>{t('description')}</p>
      <fieldset disabled={busy || settings.status !== 'ready'}>
        <div className="actions">
          <button onClick={() => void run(refresh)}>{t('refresh')}</button>
        </div>
        <label>
          {t('server')}
          <select
            value={id ?? ''}
            onChange={(event) => {
              setId(data.connections.find(item => item.id === event.target.value)?.id)
            }}
          >
            <option value="">{t('choose')}</option>
            {data.connections.map(item => (
              <option key={item.id} value={item.id}>
                {settings.value?.profiles[item.id]?.label ?? item.label} · {item.alias}
              </option>
            ))}
          </select>
        </label>
        {!data.connections.length && <p>{t('empty')}</p>}
        {row && (
          <div className="card">
            <p>
              {saved ? t('bookmarked') : t('discovered')} · {row.alias}
            </p>
            <label>
              {t('label')}
              <input
                value={label}
                maxLength={200}
                onChange={(event) => {
                  setLabel(event.target.value)
                }}
              />
            </label>
            <label>
              {t('directory')}
              <input
                value={directory}
                maxLength={4096}
                onChange={(event) => {
                  setDirectory(event.target.value)
                }}
              />
            </label>
            <p>{t('directoryHint')}</p>
            <label className="check">
              <input
                type="checkbox"
                checked={allow}
                onChange={(event) => {
                  setAllow(event.target.checked)
                }}
              />
              {t('allow')}
            </label>
            <div className="actions">
              <button
                disabled={!settings.writable || !label.trim()}
                onClick={() =>
                  void run(async () => {
                    await persist()
                    if (mounted.current) setMessage(t('saved'))
                  })
                }
              >
                {t('save')}
              </button>
              {saved && (
                <button
                  disabled={!settings.writable}
                  onClick={() =>
                    void run(async () => {
                      if (!id || !(await save(id, undefined))) throw new Error(t('readOnly'))
                      await refresh()
                      if (mounted.current) setMessage(t('removed'))
                    })
                  }
                >
                  {t('remove')}
                </button>
              )}
            </div>
            <div className="actions">
              <button
                onClick={() =>
                  void run(async (signal) => {
                    if (!id) return
                    const result = await test(id, signal)
                    if (mounted.current)
                      setMessage(
                        result.connected
                          ? `${t('passed')}\n${result.user}@${result.host}:${result.port}`
                          : `${t('failed')}\n${result.message}`,
                      )
                  })
                }
              >
                {t('test')}
              </button>
              <button disabled={!settings.writable || !label.trim()} onClick={() => void run(signal => begin(true, signal))}>
                {t('terminal')}
              </button>
              <button
                disabled={!settings.writable || !label.trim() || !allow}
                onClick={() => void run(signal => begin(false, signal))}
              >
                {t('conversation')}
              </button>
            </div>
          </div>
        )}
      </fieldset>
      {busy && (
        <div className="actions">
          <span>{t('pending')}</span>
          <button onClick={() => active.current?.abort()}>{t('cancel')}</button>
        </div>
      )}
      {message && (
        <div className="result" role="status">
          {message}
        </div>
      )}
      {failure && (
        <div className="error" role="alert">
          {failure}
        </div>
      )}
      {data.warnings.map((warning, index) => (
        <p key={index}>{warning}</p>
      ))}
      <p>{t('security')}</p>
      <p>{t('scope')}</p>
    </section>
  )
}
