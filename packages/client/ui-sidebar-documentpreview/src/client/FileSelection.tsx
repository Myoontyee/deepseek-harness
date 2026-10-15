/** File quotations enter the existing composer annotation draft. */
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { annotationSelectionMarkdown, MarkdownText, Menu, InlineCommentEditor } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ResponseAnnotation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TextPreviewProps } from './TextPreview.tsx'
import css from './FileSelection.module.css'

/** @param props - Displayed file, composer action and selectable document body. @returns File selection actions. */
export function FileSelection({ children, sourceUrl, sourceLabel, addAnnotation, t, renderVoice, openDiscussion }: {
  openDiscussion?: ((annotation: ResponseAnnotation) => void) | undefined
  renderVoice?: (value: string, onChange: (value: string) => void) => ReactNode
  children: ReactNode
  sourceUrl: string
  sourceLabel: string
  addAnnotation: (annotation: ResponseAnnotation) => boolean
  t: TextPreviewProps['t']
}) {
  const anchor = useRef<Range | null>(null)
  const [selection, setSelection] = useState<{ range: Range; annotation: ResponseAnnotation } | null>(null)
  const [editing, setEditing] = useState<ResponseAnnotation | null>(null)
  const [comment, setComment] = useState('')
  const [failed, setFailed] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, ResponseAnnotation>>({})
  const draftKey = (annotation: ResponseAnnotation): string => JSON.stringify([sourceUrl, annotation.text])
  const forget = (annotation: ResponseAnnotation): void => {
    setDrafts(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== draftKey(annotation))))
  }
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
    if (addAnnotation(annotation)) { forget(annotation); setSelection(null); setEditing(null); setFailed(false) }
    else setFailed(true)
  }
  const changeComment = (value: string): void => {
    setComment(value)
    if (editing) setDrafts(current => ({ ...current, [draftKey(editing)]: { ...editing, comment: value } }))
  }
  return <>
    <div className={css.contents} onPointerDown={() => { setSelection(null) }}
      onPointerUp={(event) => { capture(event.currentTarget) }} onKeyUp={(event) => { capture(event.currentTarget) }}>
      {children}
    </div>
    {selection !== null && editing === null && <Menu open anchor={null} portal compact side="top"
      getAnchorRect={() => selection.range.commonAncestorContainer.isConnected ? selection.range.getBoundingClientRect() : null}
      items={[{ id: 'add', label: t('selection.add') }, { id: 'comment', label: t('selection.comment') },
        ...(openDiscussion ? [{ id: 'discuss', label: t('selection.discuss') }] : [])]}
      onClose={() => { setSelection(null) }} onSelect={(id) => {
        if (id === 'discuss') { openDiscussion?.(selection.annotation); setSelection(null); return }
        if (id === 'comment') { anchor.current = selection.range; setEditing(selection.annotation); setComment(drafts[draftKey(selection.annotation)]?.comment ?? ''); setSelection(null) }
        else add(selection.annotation)
      }} />}
    {editing === null && Object.entries(drafts).map(([key, draft]) => <div className={css.pendingDraft} key={key}>
      <button type="button" onClick={() => { setEditing(draft); setComment(draft.comment); setSelection(null) }}>
        {t('selection.resume')} — {draft.text.slice(0, 48)}
      </button>
      <button type="button" onClick={() => { forget(draft) }}>{t('selection.discardDraft')}</button>
    </div>)}
    {failed && <p role="alert">{t('selection.busy')}</p>}
    {editing !== null && <InlineCommentEditor
      getAnchorRect={() => anchor.current?.commonAncestorContainer.isConnected ? anchor.current.getBoundingClientRect() : null}
      title={t('selection.comment')} inputLabel={t('selection.remark')} value={comment} onChange={changeComment}
      onClose={() => { setEditing(null); setFailed(false) }} onSubmit={() => { add({ ...editing, comment }) }}
      submitLabel={t('selection.add')} cancelLabel={t('selection.close')}
      voice={renderVoice?.(comment, changeComment)}>
      <p>{sourceLabel}</p>
      <MarkdownText text={editing.text} variant="compact" labels={{ code: { copyLabel: t('selection.copy'), copiedLabel: t('selection.copied') }, footnotes: t('selection.footnotes') }} />
    </InlineCommentEditor>}
  </>
}
