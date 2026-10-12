/** Composer-owned quotations with a preview and comment editor. */
import { useEffect, useRef, useState } from 'react'
import {
  HoverCard, Modal, Tooltip, IconQueueOutlineRegular, IconEditOutlineRegular,
  IconTrashOutlineRegular, IconCloseOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InputActions, DraftAnnotation } from '../../contract/input.ts'
import type { ConversationContentProps } from '../../contract/slots.ts'
import css from './Annotations.module.css'

/**
 * Preview quotations on hover and manage comments without changing the request draft.
 * @param props - Current annotations, mutation actions, availability, and localized copy.
 * @returns A previewable count chip and editor, or nothing when empty.
 */
export function AnnotationDrafts({ annotations, actions, disabled, t }: {
  annotations: readonly DraftAnnotation[]
  actions: InputActions
  disabled: boolean
  t: ConversationContentProps['t']
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<DraftAnnotation['id']>()
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (annotations.length === 0) { setOpen(false); setEditing(undefined) }
  }, [annotations.length])
  if (annotations.length === 0) return null
  const edit = (id?: DraftAnnotation['id']): void => { setEditing(id); setOpen(true) }
  const remove = (id: DraftAnnotation['id']): void => {
    if (disabled) return
    actions.removeAnnotation(id)
    if (annotations.length === 1) setOpen(false)
  }
  const count = t('annotation.count', { count: annotations.length })
  const cards = (editable: boolean) => <div className={css.items} data-annotation-preview={editable ? undefined : ''}>
    {annotations.map((annotation, index) => <section className={css.item} key={annotation.id} data-annotation-id={annotation.id}>
      <div className={css.heading}>
        <span className={css.source}>{index + 1}. {t('annotation.selectedText')}</span>
        <span className={css.tools}>
          {!editable && <Tooltip label={t('annotation.edit')}><button type="button" className={css.iconButton}
            aria-label={t('annotation.edit')} disabled={disabled} onClick={() => { edit(annotation.id) }}><IconEditOutlineRegular /></button></Tooltip>}
          <Tooltip label={t('annotation.remove')}><button type="button" className={css.iconButton}
            aria-label={t('annotation.remove')} disabled={disabled} onClick={() => { remove(annotation.id) }}><IconTrashOutlineRegular /></button></Tooltip>
        </span>
      </div>
      <blockquote className={css.quote}>{annotation.text}</blockquote>
      {annotation.sourceLabel && <div className={css.source}>{annotation.sourceLabel}</div>}
      {editable ? <label className={css.commentLabel}>
        {t('annotation.comment')}
        <textarea className={css.comment} value={annotation.comment} disabled={disabled}
          data-modal-autofocus={annotation.id === (editing ?? annotations[0]?.id) ? '' : undefined}
          aria-label={t('annotation.comment')} placeholder={t('annotation.comment')}
          onChange={(event) => { actions.updateAnnotation(annotation.id, event.target.value) }} />
      </label> : <button type="button" className={css.commentPreview} disabled={disabled} onClick={() => { edit(annotation.id) }}>
        {annotation.comment || t('annotation.comment')}
      </button>}
    </section>)}
  </div>
  return <div className={css.tray} ref={container} data-draft-annotations>
    <div className={css.chip}>
      <HoverCard variant="preview" widthAnchorRef={container} openDelayMs={150} disabled={open}
        anchor={<button type="button" className={css.badge} aria-expanded={open} aria-haspopup="dialog" onClick={() => { edit() }}>
          <IconQueueOutlineRegular />{count}
        </button>}
        content={cards(false)} />
      <Tooltip label={t('annotation.clear')}><button type="button" className={css.clear} aria-label={t('annotation.clear')}
        disabled={disabled} onClick={() => {
          if (disabled) return
          for (const annotation of annotations) actions.removeAnnotation(annotation.id)
          setOpen(false)
        }}><IconCloseOutlineRegular /></button></Tooltip>
    </div>
    <Modal open={open} title={count} closeLabel={t('annotation.close')} onClose={() => { setOpen(false) }}
      description={t('annotation.savedHint')} contentClassName={css.editor ?? ''}
      footer={<button type="button" className={css.done} onClick={() => { setOpen(false) }}>{t('annotation.done')}</button>}>
      {cards(true)}
    </Modal>
  </div>
}
