/** File quotations enter the existing composer annotation draft. */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { annotationSelectionMarkdown, MarkdownText, Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ResponseAnnotation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TextPreviewProps } from './TextPreview.tsx'
import css from './FileSelection.module.css'

/** @param props - Displayed file, composer action and selectable document body. @returns File selection actions. */
export function FileSelection({ children, sourceUrl, sourceLabel, addAnnotation, t }: {
  children: ReactNode
  sourceUrl: string
  sourceLabel: string
  addAnnotation: (annotation: ResponseAnnotation) => boolean
  t: TextPreviewProps['t']
}) {
  const [selection, setSelection] = useState<{ range: Range; annotation: ResponseAnnotation } | null>(null)
  const [editing, setEditing] = useState<ResponseAnnotation | null>(null)
  const [comment, setComment] = useState('')
  const [failed, setFailed] = useState(false)
  const capture = (root: HTMLDivElement): void => {
    const selected = root.ownerDocument.getSelection()
    const editable = (node: Node | null): boolean => Boolean((node instanceof Element ? node : node?.parentElement)?.closest('textarea,input,[contenteditable="true"]'))
    if (!selected || selected.isCollapsed || selected.rangeCount !== 1
      || !root.contains(selected.anchorNode) || !root.contains(selected.focusNode)
      || editable(selected.anchorNode) || editable(selected.focusNode)) { setSelection(null); return }
    const range = selected.getRangeAt(0).cloneRange()
    const text = annotationSelectionMarkdown(root, range)
    setFailed(false)
    setSelection(text.trim() ? { range, annotation: { text, comment: '', sourceUrl, sourceLabel, sourceMessage: sourceLabel } } : null)
  }
  const add = (annotation: ResponseAnnotation): void => {
    if (addAnnotation(annotation)) { setSelection(null); setEditing(null); setFailed(false) }
    else setFailed(true)
  }
  return <>
    <div className={css.contents} onPointerDown={() => { setSelection(null) }}
      onPointerUp={(event) => { capture(event.currentTarget) }} onKeyUp={(event) => { capture(event.currentTarget) }}>
      {children}
    </div>
    {selection !== null && editing === null && <Menu open anchor={null} portal compact side="top"
      getAnchorRect={() => selection.range.commonAncestorContainer.isConnected ? selection.range.getBoundingClientRect() : null}
      items={[{ id: 'add', label: t('selection.add') }, { id: 'comment', label: t('selection.comment') }]}
      onClose={() => { setSelection(null) }} onSelect={(id) => {
        if (id === 'comment') { setEditing(selection.annotation); setComment(''); setSelection(null) }
        else add(selection.annotation)
      }} />}
    {failed && <p role="alert">{t('selection.busy')}</p>}
    {editing !== null && <Modal open title={t('selection.comment')} closeLabel={t('selection.close')}
      contentClassName={css.editor ?? ''} onClose={() => { setEditing(null); setFailed(false) }}
      onKeyDownCapture={(event) => {
        if (event.key !== 'Enter' || !event.ctrlKey || event.altKey || event.shiftKey || event.metaKey
          || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
        event.preventDefault(); event.stopPropagation()
        if (!event.repeat) add({ ...editing, comment })
      }}
      footer={<button type="button" onClick={() => { add({ ...editing, comment }) }}>{t('selection.add')} <small aria-hidden="true">Ctrl+Enter</small></button>}>
      <p>{sourceLabel}</p>
      <MarkdownText text={editing.text} variant="compact" labels={{ code: { copyLabel: t('selection.copy'), copiedLabel: t('selection.copied') }, footnotes: t('selection.footnotes') }} />
      <textarea className={css.comment} data-modal-autofocus aria-label={t('selection.remark')}
        placeholder={t('selection.remark')} value={comment} onChange={(event) => { setComment(event.target.value) }} />
    </Modal>}
  </>
}
