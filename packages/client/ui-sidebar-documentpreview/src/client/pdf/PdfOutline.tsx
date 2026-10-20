/** Collapsible PDF bookmarks; failures leave the document readable. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PdfDocument } from './document.ts'
import { outlinePage, type PdfOutlineItems } from './outline.ts'
import css from './PdfBody.module.css'

type OutlineState = { kind: 'loading' } | { kind: 'ready'; items: PdfOutlineItems } | { kind: 'failed' }

/**
 * Read bookmarks once for this document and navigate only to its internal pages.
 * @param props - document, lifetime, navigation callback, and localized copy.
 * @returns an accessible outline disclosure and its nested bookmark list.
 */
export function PdfOutline({ document, signal, onNavigate, t }: {
  readonly document: PdfDocument
  readonly signal: AbortSignal
  readonly onNavigate: (page: number) => void
} & PropsLocale<'sidebarPdf'>): ReactNode {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<OutlineState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [navigationFailed, setNavigationFailed] = useState(false)
  const navigation = useRef<AbortController>()
  const panelId = useId()
  useEffect(() => {
    const lifetime = new AbortController()
    const active = AbortSignal.any([lifetime.signal, signal])
    setState({ kind: 'loading' })
    void document.getOutline().then((items) => {
      if (!active.aborted) setState({ kind: 'ready', items: items ?? [] })
    }, () => { if (!active.aborted) setState({ kind: 'failed' }) })
    return () => { lifetime.abort(); navigation.current?.abort() }
  }, [document, signal, attempt])
  const navigate = (destination: PdfOutlineItems[number]['dest']): void => {
    navigation.current?.abort()
    const request = new AbortController()
    navigation.current = request
    const active = AbortSignal.any([request.signal, signal])
    setNavigationFailed(false)
    void outlinePage(document, destination, active).then((page) => {
      if (active.aborted) return
      if (page === null) setNavigationFailed(true)
      else onNavigate(page)
    }, () => { if (!active.aborted) setNavigationFailed(true) })
  }
  return <aside className={css.outline} aria-label={t('outline')} data-pdf-outline>
    <button type="button" className={css.outlineToggle} aria-expanded={open} aria-controls={panelId}
      onClick={() => { setOpen(value => !value) }}>
      <IconChevronDownOutlineRegular size={14} className={open ? undefined : css.outlineCollapsed} />
      {t('outline')}
    </button>
    <div id={panelId} className={css.outlinePanel} hidden={!open}>
      {state.kind === 'loading' && <p role="status">{t('outlineLoading')}</p>}
      {state.kind === 'failed' && <div role="alert"><span>{t('outlineFailed')}</span>
        <Button size="sm" onClick={() => { setAttempt(value => value + 1) }}>{t('retry')}</Button></div>}
      {state.kind === 'ready' && (state.items.length === 0 ? <p>{t('outlineEmpty')}</p>
        : <OutlineList items={state.items} navigate={navigate} t={t} />)}
      {navigationFailed && <p role="alert">{t('outlineNavigationFailed')}</p>}
    </div>
  </aside>
}

function OutlineList({ items, navigate, t }: {
  readonly items: PdfOutlineItems
  readonly navigate: (destination: PdfOutlineItems[number]['dest']) => void
} & PropsLocale<'sidebarPdf'>): ReactNode {
  return <ul className={css.outlineList}>{items.map((item, index) => <li key={index}>
    <button type="button" className={css.outlineItem} disabled={item.dest === null || item.dest === undefined}
      onClick={() => { navigate(item.dest) }}>{item.title.trim() || t('outlineUntitled')}</button>
    {item.items.length > 0 && <OutlineList items={item.items} navigate={navigate} t={t} />}
  </li>)}</ul>
}
