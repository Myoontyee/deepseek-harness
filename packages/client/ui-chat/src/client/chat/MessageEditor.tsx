/** Inline editor for a sent human prompt; admission failures preserve the draft. */
import { useEffect, useRef, useState } from 'react'
import type { ChatViewSlotProps, MessageEditSlash } from '../contract/slots.ts'
import css from './MessageEditor.module.css'

/** @param props - Original request, admission action, cancellation, and localized copy. @returns Inline edit controls. */
export function MessageEditor({ text, allowEmpty, disabled, annotationCount, onSave, onCancel, t, slash }: {
  slash?: MessageEditSlash | undefined
  text: string
  allowEmpty: boolean
  disabled: boolean
  annotationCount: number
  onSave: (text: string) => Promise<void>
  onCancel: () => void
  t: ChatViewSlotProps['t']
}) {
  const [draft, setDraft] = useState(text)
  const [catalogReady, setCatalogReady] = useState(false)
  const [catalog, setCatalog] = useState<Awaited<ReturnType<MessageEditSlash['list']>>>([])
  const [cursor, setCursor] = useState(text.length)
  const [highlight, setHighlight] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const slashMatch = /(?:^|\s)\/([^\s]*)$/u.exec(draft.slice(0, cursor))
  const candidates = dismissed || slashMatch === null ? [] : catalog.filter(item =>
    (item.kind === 'skill' || draft.slice(0, cursor).replace(/\/[^\s]*$/u, '').trim() === '')
    && item.name.toLowerCase().includes((slashMatch[1] ?? '').toLowerCase())).slice(0, 12)
  const command = catalog.find(item => item.kind === 'command' && `/${item.name}` === draft.trim().split(/\s+/u)[0])
  useEffect(() => {
    if (slash === undefined) return
    let live = true
    setCatalogReady(false)
    const timer = setTimeout(() => {
      void slash.list().then((items) => { if (live) { setCatalog(items); setCatalogReady(true) } }).catch(() => { if (live) setFailure(t('message.editCatalogFailed')) })
    }, 120)
    return () => { live = false; clearTimeout(timer) }
  }, [slash, slashMatch?.[1]])
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState('')
  const busy = useRef(false)
  const composing = useRef(false)
  const live = useRef(true)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    live.current = true
    input.current?.focus()
    input.current?.setSelectionRange(text.length, text.length)
    setCursor(text.length)
    return () => { live.current = false }
  }, [])
  const save = async (): Promise<void> => {
    if ((slash !== undefined && /^\s*\//u.test(draft) && !catalogReady) || busy.current || disabled || (!allowEmpty && draft.trim() === '')) return
    busy.current = true
    setSaving(true)
    setFailure('')
    try {
      if (command !== undefined && slash !== undefined) await slash.execute(draft)
      else await onSave(draft)
      if (live.current) onCancel()
    } catch (error) {
      console.warn('[ui-chat] message edit failed', error)
      if (!live.current) return
      const reason = error instanceof Error ? error.message : ''
      setFailure(command !== undefined ? reason : t(reason === 'MESSAGE_EDIT_BUSY' ? 'message.editBusy'
        : reason === 'MESSAGE_EDIT_NOT_LATEST' ? 'message.editStale'
          : reason === 'MESSAGE_EDIT_COMPACTED' ? 'message.editCompacted' : 'message.editFailed'))
    } finally {
      busy.current = false
      if (live.current) setSaving(false)
    }
  }
  const pick = (name: string): void => {
    const prefix = draft.slice(0, cursor).replace(/\/[^\s]*$/u, `/${name} `)
    const next = prefix + draft.slice(cursor)
    setDraft(next); setCursor(prefix.length); setDismissed(true)
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(prefix.length, prefix.length) })
  }
  return (
    <div className={css.editor} data-message-editor onKeyDown={(event) => {
      if (!composing.current && !event.nativeEvent.isComposing && Reflect.get(event.nativeEvent, 'keyCode') !== 229
        && candidates.length > 0 && !event.ctrlKey && !event.metaKey) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); event.stopPropagation()
          setHighlight(value => (value + (event.key === 'ArrowDown' ? 1 : candidates.length - 1)) % candidates.length)
          return
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault(); event.stopPropagation()
          const candidate = candidates[highlight % candidates.length]
          if (candidate !== undefined) pick(candidate.name)
          return
        }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDismissed(true); return }
      }
      if (event.key !== 'Enter'  || !event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
      event.stopPropagation()
      if (composing.current || event.nativeEvent.isComposing
        || Reflect.get(event.nativeEvent, 'keyCode') === 229) return
      event.preventDefault()
      if (!event.repeat) void save()
    }}>
      {annotationCount > 0 && <div>{t('message.annotations', { count: annotationCount })}</div>}
      <textarea ref={input} className={css.input} aria-label={t('message.edit')} value={draft}
        onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
        disabled={saving || disabled} onSelect={(event) => { setCursor(event.currentTarget.selectionStart) }}
        onChange={(event) => {
          setDraft(event.target.value); setCursor(event.target.selectionStart); setHighlight(0); setDismissed(false)
        }} />
      {candidates.length > 0 && <div className={css.menu} role="listbox" aria-label={t('message.editSlash')}>
        {candidates.map((item, index) => <button key={`${item.kind}:${item.name}`} type="button" role="option"
          aria-selected={index === highlight % candidates.length} onMouseDown={event => event.preventDefault()}
          onClick={() => { pick(item.name) }}>
          <strong>/{item.name}</strong><small>{t(item.kind === 'skill' ? 'message.editSkill' : 'message.editCommand')}</small>
          <span>{item.description}</span>
        </button>)}
      </div>}
      <p className={css.hint}>{t(command === undefined ? 'message.editHint' : 'message.editCommandHint')}</p>
      {failure !== '' && <p role="alert" className={css.failure}>{failure}</p>}
      <div className={css.actions}>
        <button type="button" onClick={onCancel} disabled={saving}>{t('cancel')}</button>
        <button type="button" className={css.save} disabled={saving || disabled || (slash !== undefined && /^\s*\//u.test(draft) && !catalogReady) || (!allowEmpty && draft.trim() === '')}
          aria-keyshortcuts="Control+Enter" title={t('message.editSaveShortcut')} onClick={() => { void save() }}>{t(saving ? 'message.editSaving' : command === undefined ? 'message.editSave' : 'message.editRunCommand')}</button>
      </div>
    </div>
  )
}
