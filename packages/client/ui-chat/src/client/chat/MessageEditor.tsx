/** Inline editor for a sent human prompt; admission failures preserve the draft. */
import { useEffect, useRef, useState } from 'react'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import css from './MessageEditor.module.css'

/** @param props - Original request, admission action, cancellation, and localized copy. @returns Inline edit controls. */
export function MessageEditor({ text, allowEmpty, disabled, annotationCount, onSave, onCancel, t }: {
  text: string
  allowEmpty: boolean
  disabled: boolean
  annotationCount: number
  onSave: (text: string) => Promise<void>
  onCancel: () => void
  t: ChatViewSlotProps['t']
}) {
  const [draft, setDraft] = useState(text)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState('')
  const busy = useRef(false)
  const composing = useRef(false)
  const live = useRef(true)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { live.current = true; input.current?.focus(); return () => { live.current = false } }, [])
  const save = async (): Promise<void> => {
    if (busy.current || disabled || (!allowEmpty && draft.trim() === '')) return
    busy.current = true
    setSaving(true)
    setFailure('')
    try {
      await onSave(draft)
      if (live.current) onCancel()
    } catch (error) {
      console.warn('[ui-chat] message edit failed', error)
      if (!live.current) return
      const reason = error instanceof Error ? error.message : ''
      setFailure(t(reason === 'MESSAGE_EDIT_BUSY' ? 'message.editBusy'
        : reason === 'MESSAGE_EDIT_NOT_LATEST' ? 'message.editStale'
          : reason === 'MESSAGE_EDIT_COMPACTED' ? 'message.editCompacted' : 'message.editFailed'))
    } finally {
      busy.current = false
      if (live.current) setSaving(false)
    }
  }
  return (
    <div className={css.editor} data-message-editor onKeyDown={(event) => {
      if (event.key !== 'Enter' || !event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
      event.stopPropagation()
      if (composing.current || event.nativeEvent.isComposing || Reflect.get(event.nativeEvent, 'keyCode') === 229) return
      event.preventDefault()
      if (!event.repeat) void save()
    }}>
      {annotationCount > 0 && <div>{t('message.annotations', { count: annotationCount })}</div>}
      <textarea ref={input} className={css.input} aria-label={t('message.edit')} value={draft}
        onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
        disabled={saving || disabled} onChange={(event) =>{  setDraft(event.target.value) }} />
      <p className={css.hint}>{t('message.editHint')}</p>
      {failure !== '' && <p role="alert" className={css.failure}>{failure}</p>}
      <div className={css.actions}>
        <button type="button" onClick={onCancel} disabled={saving}>{t('cancel')}</button>
        <button type="button" className={css.save} disabled={saving || disabled || (!allowEmpty && draft.trim() === '')}
          aria-keyshortcuts="Control+Enter" title={t('message.editSaveShortcut')} onClick={() => { void save() }}>{t(saving ? 'message.editSaving' : 'message.editSave')}</button>
      </div>
    </div>
  )
}
