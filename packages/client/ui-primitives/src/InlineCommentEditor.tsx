/** Anchored comment entry shared by transcript and file selections. */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MenuSurface } from './MenuSurface.tsx'
import css from './InlineCommentEditor.module.css'

/**
 * @param props - Selection geometry, localized labels, draft and optional microphone.
 * @returns A non-modal, draft-preserving comment panel.
 */
export function InlineCommentEditor({ getAnchorRect, title, inputLabel = title, value, onChange, onClose, onSubmit,
  submitLabel, cancelLabel, children, voice }: {
  getAnchorRect: () => DOMRect | null
  title: string
  inputLabel?: string
  value: string
  onChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
  submitLabel: string
  cancelLabel: string
  children?: ReactNode
  voice?: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const [position, setPosition] = useState({ left: 16, top: 64 })
  useLayoutEffect(() => { input.current?.focus() }, [])
  useLayoutEffect(() => {
    const place = (): void => {
      const rect = getAnchorRect()
      const width = panel.current?.offsetWidth ?? 420, height = panel.current?.offsetHeight ?? 200
      const left = Math.max(16, Math.min(rect?.left ?? 16, window.innerWidth - width - 16))
      const top = Math.max(64, Math.min(rect ? rect.top - height - 8 : 64, window.innerHeight - height - 16))
      setPosition({ left, top })
    }
    place()
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place)
    if (panel.current) observer?.observe(panel.current)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); observer?.disconnect() }
  }, [getAnchorRect])
  return createPortal(<MenuSurface ref={panel} className={css.panel} style={position} role="dialog" aria-label={title}
    onPointerDown={(event) => { event.stopPropagation() }} onPointerUp={(event) => { event.stopPropagation() }}
    onKeyDown={(event) => {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
      if (event.key === 'Enter' && event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
        event.preventDefault(); event.stopPropagation(); if (!event.repeat) onSubmit()
      }
    }}>
    <details className={css.quote}><summary>{title}</summary>{children}</details>
    <textarea ref={input} aria-label={inputLabel} placeholder={inputLabel} value={value}
      onChange={(event) => { onChange(event.target.value) }} />
    <div className={css.tools}>{voice}
      <button type="button" onClick={onClose}>{cancelLabel} <small aria-hidden="true">Esc</small></button>
      <button type="button" onClick={onSubmit}>{submitLabel} <small aria-hidden="true">Ctrl+Enter</small></button></div>
  </MenuSurface>, document.body)
}
