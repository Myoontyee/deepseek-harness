/** Reusable user contents inside a caller-owned message row. */
import { Fragment, useEffect, useRef } from 'react'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import { fileExtension, FileTypeIcon, fileSizeText, JsonBlock, MarkdownText, parseResponseAnnotations, registerLiteralCopy } from '@deepseek-ai/dsh-client-ui-primitives'
import { markdownLabels } from '../markdown-labels.ts'
import css from './MessageItem.module.css'

const EMPTY_LABELS: readonly string[] = []

/**
 * Render prepared text, ordered attachments, and references without message chrome.
 * The caller owns row identity, pending/echo state, time, and message actions.
 * @param props - prepared content, facts, authorized image loader, and framework Factory/locale seats.
 * @returns the content stack using the existing user-message layout.
 */
export function UserContent({ content, loadImage, facts, interactive = false, ellipsis = false, renderSlot, renderFactorySlot, t }:
FactoryComponentPropsOf<'conversation.chat.user.content'>) {
  const { text, attachments, extraBlocks, referenceLabels = EMPTY_LABELS } = content
  const annotated = parseResponseAnnotations(text)
  const bodyText = annotated?.text ?? text
  const literalBody = useRef<HTMLSpanElement>(null)
  useEffect(() => literalBody.current === null ? undefined : registerLiteralCopy(literalBody.current), [])
  const compactImages = attachments.length > 1
  const truncated = (total: number): string => t('json.truncated', { total })
  const showBubble = text !== '' || extraBlocks.length > 0
  return (
    <div className={css.userStack}>
      {attachments.length > 0 && (
        <div className={css.attachmentRow} data-message-attachments>
          {attachments.map((attachment, index) => attachment.type === 'image'
            ? (
              <Fragment key={`image:${index}`}>
                {renderSlot('conversation.chat.user.images', {
                  images: [attachment.image], loadImage, align: 'end', compact: compactImages,
                })}
              </Fragment>
            )
            : (
              <span key={`file:${index}`} className={css.fileCard} title={attachment.file.name}>
                <FileTypeIcon path={attachment.file.name} className={css.fileIcon} />
                <span className={css.fileContent}>
                  <span className={css.fileName}>{attachment.file.name}</span>
                  <span className={css.fileMeta}>
                    {[fileExtension(attachment.file.name).toUpperCase().slice(0, 8), fileSizeText(attachment.file.bytes)]
                      .filter(Boolean).join(' ')}
                  </span>
                </span>
              </span>
            ))}
        </div>
      )}
      {showBubble && <div className={css.bubble}>
        <div data-message-copy>
          {annotated !== null && <details className={css.annotations} data-message-annotations>
            <summary>{t('message.annotations', { count: annotated.annotations.length })}</summary>
            {annotated.annotations.map((annotation, index) => <div key={index} className={css.annotation}>
              <span className={css.annotationSource}>{`${index + 1}. ${annotation.sourceLabel}`.trimEnd()}</span>
              <MarkdownText variant="compact" text={annotation.text} labels={markdownLabels(t)} />
              {annotation.comment && <div>{renderFactorySlot('conversation.user.text', { text: annotation.comment, facts, interactive, ellipsis })}</div>}
            </div>)}
          </details>}
          <span ref={literalBody} data-message-literal>
            {renderFactorySlot('conversation.user.text', { text: bodyText, facts, interactive, ellipsis })}
          </span>
        </div>
        {extraBlocks.map((block, index) => (
          <JsonBlock key={index} label={t('message.extraBlock')} payload={block} truncatedLabel={truncated} />
        ))}
      </div>}
      {referenceLabels.length > 0 && (
        <div className={css.referenceSummary}>
          {t('message.referenceSummary', { labels: referenceLabels.join(t('message.referenceSeparator')) })}
        </div>
      )}
    </div>
  )
}
