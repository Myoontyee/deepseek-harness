// MessageContextMenu: right-click menu for message rows (user bubbles and
// assistant bodies), Codex-style. Copy and copy-as-markdown are shared;
// quote puts the message into the composer draft; edit (user rows only) puts
// the message text back in the draft for reworking. The menu shell, portal
// positioning, and roving keyboard navigation come from ui-primitives'
// ContextMenu; a brief "copied" chip mirrors the block primitives' feedback.
//
// The wrapper row is the context-menu target: child surfaces (code blocks)
// may stopPropagation in their own onContextMenu to take precedence.

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ContextMenu, hasActiveSelection, IconCodeOutline16, IconCopyOutline16, IconEditOutline16,
  type MenuEntry, writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import css from './MessageContextMenu.module.css'

/** How long the post-copy chip stays visible, in ms. */
const COPIED_FEEDBACK_MS = 1000

/**
 * Quote `text` into a draft: every line gets a `> ` marker, and a non-empty
 * existing draft keeps its content above the quote.
 * @param draft - the current composer draft.
 * @param text - the message text to quote.
 * @returns the full next draft.
 */
export function quoteIntoDraft(draft: string, text: string): string {
  const quoted = text.split('\n').map(line => `> ${line}`).join('\n')
  return draft.length === 0 ? quoted : `${draft}\n\n${quoted}`
}

export interface MessageContextMenuProps {
  /** Plain text the copy action writes. */
  text: string
  /**
   * Markdown source the copy-as-markdown action writes; the item is omitted
   * when undefined (plain-text user rows have no markdown source).
   */
  markdown?: string | undefined
  /** Put the message back into the composer draft (user rows only). */
  onEdit?: (() => void) | undefined
  /** Quote the message into the composer draft (shared by every row). */
  onQuote: () => void
  /** The owning view's locale seat, passed down as a plain prop. */
  t: ChatViewSlotProps['t']
  /** The wrapped row content. */
  children: ReactNode
}

/**
 * Wrap one message row with a right-click context menu.
 * @param props - copy texts, optional edit, quote, locale, row content.
 * @returns the row wrapper plus the portaled menu and copy chip.
 */
export function MessageContextMenu({ text, markdown, onEdit, onQuote, t, children }: MessageContextMenuProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (copyTimer.current !== null) clearTimeout(copyTimer.current)
  }, [])

  const items: MenuEntry[] = [
    { id: 'copy', label: t('contextMenu.copy'), icon: <IconCopyOutline16 /> },
  ]
  if (markdown !== undefined) {
    items.push({ id: 'copy-markdown', label: t('contextMenu.copyMarkdown'), icon: <IconCodeOutline16 /> })
  }
  items.push(
    { type: 'separator', id: 'sep' },
    { id: 'quote', label: t('contextMenu.quote') },
  )
  if (onEdit !== undefined) {
    items.push({ id: 'edit', label: t('contextMenu.edit'), icon: <IconEditOutline16 /> })
  }

  const copy = (value: string): void => {
    void writeClipboard(value).then((ok) => {
      if (!ok) return
      setCopied(true)
      if (copyTimer.current !== null) clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => { setCopied(false) }, COPIED_FEEDBACK_MS)
    })
  }

  const onSelect = (id: string): void => {
    setOpen(false)
    if (id === 'copy') copy(text)
    else if (id === 'copy-markdown') copy(markdown ?? text)
    else if (id === 'quote') onQuote()
    else if (id === 'edit') onEdit?.()
  }

  return (
    <div
      className={css.wrapper}
      onContextMenu={(event) => {
        // A right-click over a live selection belongs to the conversation's
        // selection menu, not this row's: leave the event unhandled so it
        // bubbles up to the selection owner (Codex behavior).
        if (hasActiveSelection()) return
        event.preventDefault()
        event.stopPropagation()
        setCopied(false)
        setPos({ x: event.clientX, y: event.clientY })
        setOpen(true)
      }}
    >
      {children}
      {pos !== null && open && (
        <ContextMenu open x={pos.x} y={pos.y} items={items} onSelect={onSelect} onClose={() => setOpen(false)} />
      )}
      {pos !== null && copied && createPortal(
        <span className={css.copiedTip} style={{ left: pos.x, top: pos.y - 8 }}>{t('copied')}</span>,
        document.body,
      )}
    </div>
  )
}
