/** Desktop-only startup preference: restore every conversation window or only the primary one. */
import { useEffect, useRef, useState } from 'react'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopStartupRestoreMode } from '../types.ts'
import css from './StartupWindowRow.module.css'

/** Desktop bridge carrying the persisted choice; it applies on the next application launch. */
export interface StartupWindowRowInjected {
  readonly restoreOnStartup: {
    get(): Promise<DesktopStartupRestoreMode>
    set(value: DesktopStartupRestoreMode): Promise<void>
  }
}

/** Mode accepted for one option value; unknown values fall back to the primary window. */
function restoreMode(value: string): DesktopStartupRestoreMode {
  return value === 'all' ? 'all' : 'primary'
}

/**
 * Render the startup window restore choice.
 * @param props - Desktop bridge and localized copy; the row is absent in browsers because only Desktop registers it.
 * @returns the General Settings row, or nothing while the saved choice loads.
 */
export function StartupWindowRow({ restoreOnStartup, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<StartupWindowRowInjected>) {
  const [mode, setMode] = useState<DesktopStartupRestoreMode>()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const selector = useRef<HTMLButtonElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let disposed = false
    void restoreOnStartup.get().then((value) => {
      if (!disposed) setMode(value)
    }).catch(() => {
      if (!disposed) setFailed(true)
    })
    return () => { disposed = true }
  }, [restoreOnStartup])
  if (mode === undefined) return failed ? <div className={css.row}><div role="alert">{t('startupWindows.error')}</div></div> : null
  return <div className={css.row}>
    <div className={css.rowText}>
      <div className={css.title}>{t('startupWindows.title')}</div>
      <div className={css.description}>{t('startupWindows.description')}</div>
      {failed && <div role="alert">{t('startupWindows.error')}</div>}
    </div>
    <Menu open={open} onClose={() => { setOpen(false) }} selectedId={mode} align="end" portal
      items={[{ id: 'all', label: t('startupWindows.all') }, { id: 'primary', label: t('startupWindows.primary') }]}
      onSelect={(value) => {
        selector.current?.focus({ preventScroll: true })
        setOpen(false)
        const next = restoreMode(value)
        setFailed(false)
        setBusy(true)
        void restoreOnStartup.set(next).then(() => { setMode(next) })
          .catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
      }}
      anchor={<button ref={selector} type="button" className={css.select}
        aria-label={t('startupWindows.title')} aria-haspopup="menu" aria-expanded={open} disabled={busy}
        onClick={() => { setOpen(value => !value) }}>
        {t(mode === 'all' ? 'startupWindows.all' : 'startupWindows.primary')}
        <IconChevronDownOutlineRegular />
      </button>}
    />
  </div>
}
