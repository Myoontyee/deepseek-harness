/** Collapsible PDF bookmarks; failures leave the document readable. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button, Tooltip, IconChevronDownOutlineRegular, IconPanelLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PdfDocument } from './document.ts'
import { outlinePage, type PdfOutlineItems } from './outline.ts'
import css from './PdfBody.module.css'

type OutlineState = { kind: 'loading' } | { kind: 'ready'; items: PdfOutlineItems } | { kind: 'failed' }

/**
 * Read bookmarks once for this document and navigate only to its internal pages.
 * @param props - document, lifetime, navigation callback, and localized copy.
 * @returns the outline toggle, nested navigation pane, and retained PDF viewport.
 */
export function PdfOutline({ document, signal, onNavigate, children, t }: {
  readonly document: PdfDocument
  readonly signal: AbortSignal
  readonly onNavigate: (page: number) => void
  readonly children?: ReactNode
} & PropsLocale<'sidebarPdf'>): ReactNode {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<OutlineState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [navigationFailed, setNavigationFailed] = useState(false)
  const navigation = useRef<AbortController>()
  const toggle = useRef<HTMLButtonElement>(null)
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
  return <div className={css.outlineLayout} data-pdf-reader onKeyDown={(event) => {
    if (!open || event.key !== 'Escape' || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    toggle.current?.focus()
  }}>
    <div className={css.readerToolbar}>
      <Tooltip label={t('outline')} portal>
        <button ref={toggle} type="button" className={css.outlineToggle} aria-label={t('outline')}
          aria-expanded={open} aria-controls={panelId} aria-pressed={open}
          onClick={() => { setOpen(value => !value) }}>
          <IconPanelLeftOutlineRegular size={18} />
        </button>
      </Tooltip>
    </div>
    <div className={css.readerColumns}>
      <aside id={panelId} className={css.outline} aria-label={t('outline')} data-pdf-outline hidden={!open}>
        <div className={css.outlineHeading}>{t('outline')}</div>
        <div className={css.outlinePanel}>
          {state.kind === 'loading' && <p role="status">{t('outlineLoading')}</p>}
          {state.kind === 'failed' && <div role="alert"><span>{t('outlineFailed')}</span>
            <Button size="sm" onClick={() => { setAttempt(value => value + 1) }}>{t('retry')}</Button></div>}
          {state.kind === 'ready' && (state.items.length === 0 ? <p>{t('outlineEmpty')}</p>
            : <OutlineList items={state.items} navigate={navigate} t={t} />)}
          {navigationFailed && <p role="alert">{t('outlineNavigationFailed')}</p>}
        </div>
      </aside>
      <div className={css.pagesViewport} data-pdf-pages-viewport>{children}</div>
    </div>
  </div>
}

function OutlineList({ items, navigate, t }: {
  readonly items: PdfOutlineItems
  readonly navigate: (destination: PdfOutlineItems[number]['dest']) => void
} & PropsLocale<'sidebarPdf'>): ReactNode {
  return <ul className={css.outlineList}>{items.map((item, index) => (
    <OutlineBranch key={index} item={item} navigate={navigate} t={t} />
  ))}</ul>
}

function OutlineBranch({ item, navigate, t }: {
  readonly item: PdfOutlineItems[number]
  readonly navigate: (destination: PdfOutlineItems[number]['dest']) => void
} & PropsLocale<'sidebarPdf'>): ReactNode {
  const [expanded, setExpanded] = useState(true)
  const title = item.title.trim() || t('outlineUntitled')
  const nestedId = useId()
  return <li>
    <div className={css.outlineRow}>
      {item.items.length > 0 ? <button type="button" className={css.branchToggle}
        aria-label={t('outlineToggleChapter', { chapter: title })} aria-expanded={expanded} aria-controls={nestedId}
        onClick={() => { setExpanded(value => !value) }}>
        <IconChevronDownOutlineRegular size={12} className={expanded ? undefined : css.outlineCollapsed} />
      </button> : <span className={css.branchSpacer} />}
      <button type="button" className={css.outlineItem} disabled={item.dest === null || item.dest === undefined}
        onClick={() => { navigate(item.dest) }}>{title}</button>
    </div>
    {item.items.length > 0 && <div id={nestedId} hidden={!expanded}><OutlineList items={item.items} navigate={navigate} t={t} /></div>}
  </li>
}
