/** Composer-owned quotation attachments, independent from the editable request. */
import { IconQueueOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InputActions, DraftAnnotation } from '../../contract/input.ts'
import type { ConversationContentProps } from '../../contract/slots.ts'
import css from './Annotations.module.css'

/**
 * Render the annotation count and editable comments.
 * @param props - Current draft attachments, mutation actions, availability, and copy.
 * @returns A collapsible attachment tray, or nothing when empty.
 */
export function AnnotationDrafts({ annotations, actions, disabled, t }: {
  annotations: readonly DraftAnnotation[]
  actions: InputActions
  disabled: boolean
  t: ConversationContentProps['t']
}) {
  if (annotations.length === 0) return null
  return (
    <details className={css.tray} data-draft-annotations>
      <summary className={css.badge}>
        <IconQueueOutlineRegular />{t('annotation.count', { count: annotations.length })}
      </summary>
      <div className={css.items}>
        {annotations.map(annotation => (
          <div className={css.item} key={annotation.id}>
            <div className={css.heading}>
              <span className={css.source}>{annotation.sourceLabel}</span>
              <button type="button" disabled={disabled} onClick={() =>{  actions.removeAnnotation(annotation.id) }}>
                {t('annotation.remove')}
              </button>
            </div>
            <blockquote className={css.quote}>{annotation.text}</blockquote>
            <textarea className={css.comment} value={annotation.comment} disabled={disabled}
              aria-label={t('annotation.comment')} placeholder={t('annotation.comment')}
              onChange={(event) =>{  actions.updateAnnotation(annotation.id, event.target.value) }} />
          </div>
        ))}
      </div>
    </details>
  )
}
