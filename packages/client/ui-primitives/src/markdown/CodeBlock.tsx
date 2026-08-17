// CodeBlock: one code surface for every consumer — markdown fences, the
// run_code program body, and the details panel's raw args/output — with
// shiki highlighting for the registered grammars and an identical-geometry
// plain fallback for everything else. Chrome (language banner + copy) matches
// deepsuite `@deepseek/md` code blocks; token colors stay on `--shiki-*`.
// Right-click opens a context menu with copy first, then the owner-supplied
// `contextActions` (this package is cordis-free, so actions arrive via props).

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import { writeClipboard } from '../clipboard.ts'
import { hasActiveSelection } from '../selection.ts'
import { ContextMenu } from '../ContextMenu.tsx'
import { IconCopyOutline16 } from '../icons/index.tsx'
import type { MenuEntry } from '../Menu.tsx'
import { grammarLoadCount, highlightToHtml, subscribeGrammarLoaded } from './highlight.ts'
import css from './CodeBlock.module.css'

/** One owner-supplied right-click action below the built-in copy. */
export interface CodeBlockContextAction {
  /** Stable menu id. */
  id: string
  /** Localized menu label. */
  label: string
  /** Run on activation. */
  run: () => void
}

export interface CodeBlockProps {
  /** The source text, rendered verbatim (trailing newline trimmed for display). */
  code: string
  /** Grammar hint (markdown fence info string or a fixed caller id); unknown = plain. */
  lang?: string | undefined
  /** Extra class merged onto the wrapper (callers position; this component draws). */
  className?: string | undefined
  /** Copy-button idle label; the owner passes localized copy (this package is cordis-free, so copy arrives via props). */
  copyLabel?: string | undefined
  /** Copy-button label during the post-copy confirmation window. */
  copiedLabel?: string | undefined
  /** Extra right-click actions shown below 复制; callers own localization and side effects. */
  contextActions?: readonly CodeBlockContextAction[] | undefined
}

export function CodeBlock({ code, lang, className, copyLabel = '复制', copiedLabel = '复制成功', contextActions }: CodeBlockProps) {
  const trimmed = code.endsWith('\n') ? code.slice(0, -1) : code
  // Re-render when a lazy grammar finishes loading, so a fence that showed plain
  // text while its language's grammar imported picks up highlighting. The
  // snapshot value is opaque; only its change across renders drives the memo.
  const loaded = useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount)
  const html = useMemo(() => highlightToHtml(trimmed, lang), [trimmed, lang, loaded])
  const rootRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const onCopy = useCallback(() => {
    if (copied) return
    /* v8 ignore next -- both arms always mount a <pre>; trimmed is the
       typed fallback if the DOM shape ever diverges. */
    const text = rootRef.current?.querySelector('pre')?.textContent ?? trimmed
    void writeClipboard(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 1000)
    })
  }, [copied, trimmed])

  const menuItems: MenuEntry[] = [
    { id: 'copy', label: copyLabel, icon: <IconCopyOutline16 /> },
    ...(contextActions ?? []).map(action => ({ id: action.id, label: action.label })),
  ]
  const onMenuSelect = (id: string): void => {
    setMenu(null)
    if (id === 'copy') {
      onCopy()
      return
    }
    /* v8 ignore next 2 -- menu items derive from contextActions, so an id
       outside their set cannot reach the lookup. */
    contextActions?.find(action => action.id === id)?.run()
  }

  const body = html === undefined
    ? (
      <pre className={css.plain}><code>{trimmed}</code></pre>
    )
    : (
  // shiki's output is a static span tree it generated from `code` (no user
  // HTML passes through), the sanctioned innerHTML consumption path per
  // shiki's own docs.
      <div dangerouslySetInnerHTML={{ __html: html }} />
    )

  return (
    <div
      ref={rootRef}
      className={clsx(css.block, 'md-code-block', className)}
      onContextMenu={(event) => {
        // A live selection yields to the owner's selection menu (bubbles).
        if (hasActiveSelection()) return
        event.preventDefault()
        event.stopPropagation()
        setMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <div className={css.bannerWrap}>
        <div className={css.banner}>
          <div className={css.infostring}>{lang ?? ''}</div>
          <div className={css.action}>
            <button type="button" className={css.copyButton} onClick={onCopy}>
              {copied ? copiedLabel : copyLabel}
            </button>
          </div>
        </div>
      </div>
      {body}
      {menu !== null && (
        <ContextMenu open x={menu.x} y={menu.y} items={menuItems} onSelect={onMenuSelect} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}
