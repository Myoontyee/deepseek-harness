/** Read-only Markdown quotation shared by annotation previews and editors. */
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationContentProps } from '../../contract/slots.ts'
import css from './Annotations.module.css'

/** @param props - Original Markdown and localized renderer controls. @returns A rendered quotation. */
export function AnnotationQuote({ text, t }: { text: string; t: ConversationContentProps['t'] }) {
  return <blockquote className={css.quote} data-annotation-quote><MarkdownText text={text} variant="compact"
    labels={{ code: { copyLabel: t('annotation.copy'), copiedLabel: t('annotation.copied') }, footnotes: t('annotation.footnotes') }} /></blockquote>
}
