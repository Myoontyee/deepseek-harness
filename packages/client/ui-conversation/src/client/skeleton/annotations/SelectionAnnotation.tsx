/** Text-selection action scoped to one conversation transcript. */
import { useEffect, useState } from 'react'
import { Menu, Modal, annotationSelectionMarkdown } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ResponseAnnotation } from '@deepseek-ai/dsh-client-ui-primitives'
import { AnnotationQuote } from './AnnotationQuote.tsx'
import css from './Annotations.module.css'
import type { ConversationContentProps } from '../../contract/slots.ts'

interface SelectedPassage {
  range: Range
  annotation: ResponseAnnotation
}

function messageOwner(node: Node | null): Element | null {
  const element = node instanceof Element ? node : node?.parentElement
  if (element?.closest('input, textarea, [contenteditable="true"]') !== null) return null
  return element.closest('[data-chat-node-key]')
}

/**
 * Offer an annotation action after mouse or keyboard text selection.
 * @param props - Transcript container, source Session, composer action, and copy.
 * @returns A selection-anchored menu when one message owns the complete selection.
 */
export function SelectionAnnotation({ container, sessionId, addAnnotation, t }: {
  container: HTMLDivElement | null
  sessionId: string
  addAnnotation: (annotation: ResponseAnnotation) => boolean
  t: ConversationContentProps['t']
}) {
  const [commenting, setCommenting] = useState<ResponseAnnotation | null>(null)
  const [comment, setComment] = useState('')
  const [drafts, setDrafts] = useState<Record<string, ResponseAnnotation>>({})
  const draftKey = (annotation: ResponseAnnotation): string => JSON.stringify([sessionId, annotation.sourceMessage, annotation.text])
  const forget = (annotation: ResponseAnnotation): void => {
    setDrafts(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== draftKey(annotation))))
  }
  const submit = (): void => {
    if (commenting !== null && addAnnotation({ ...commenting, comment })) { forget(commenting); setCommenting(null) }
  }
  const [passage, setPassage] = useState<SelectedPassage | null>(null)
  useEffect(() => {
    if (container === null) return
    const clear = (): void =>{  setPassage(null) }
    const capture = (): void => {
      const selection = container.ownerDocument.getSelection()
      if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {  clear(); return }
      const owner = messageOwner(selection.anchorNode)
      if (owner === null || !container.contains(owner) || owner !== messageOwner(selection.focusNode)) {  clear(); return }
      if (!(owner instanceof HTMLElement)) { clear(); return }
      const text = annotationSelectionMarkdown(owner, selection.getRangeAt(0))
      if (text.trim() === '') {  clear(); return }
      setPassage({
        range: selection.getRangeAt(0).cloneRange(),
        annotation: { text, comment: '', sourceUrl: `dsh://session/${encodeURIComponent(sessionId)}`,
          sourceLabel: t('annotation.source'), sourceMessage: owner.getAttribute('data-chat-node-key') ?? '' },
      })
    }
    container.addEventListener('pointerdown', clear)
    container.addEventListener('pointerup', capture)
    container.addEventListener('keyup', capture)
    return () => {
      container.removeEventListener('pointerdown', clear)
      container.removeEventListener('pointerup', capture)
      container.removeEventListener('keyup', capture)
    }
  }, [container, sessionId, t])
  if (commenting !== null) return <Modal open closeOnBackdrop={false} title={t('annotation.create')} closeLabel={t('annotation.close')}
    onClose={() => { setCommenting(null) }} contentClassName={css.editor ?? ''}
    onKeyDownCapture={(event) => {
      if (event.key !== 'Enter' || !event.ctrlKey || event.altKey || event.shiftKey || event.metaKey
        || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
      event.preventDefault(); event.stopPropagation()
      if (!event.repeat) submit()
    }}
    footer={<><button type="button" className={css.done} onClick={() => { setCommenting(null) }}>{t('annotation.cancel')} <small aria-hidden="true">Esc</small></button>
      <button type="button" className={css.done} onClick={submit}>{t('annotation.create')} <small aria-hidden="true">Ctrl+Enter</small></button></>}>
    <p>{t('annotation.draftHint')}</p>
    <AnnotationQuote text={commenting.text} t={t} />
    <textarea className={css.comment} data-modal-autofocus value={comment} aria-label={t('annotation.comment')}
      placeholder={t('annotation.comment')} onChange={(event) => {
        const value = event.target.value
        setComment(value); setDrafts(current => ({ ...current, [draftKey(commenting)]: { ...commenting, comment: value } }))
      }} />
  </Modal>
  return <>
    {Object.entries(drafts).map(([key, draft]) => <div className={css.pendingDraft} key={key}>
      <button type="button" onClick={() => { setCommenting(draft); setComment(draft.comment); setPassage(null) }}>
        {t('annotation.resume')} — {draft.text.slice(0, 48)}
      </button>
      <button type="button" onClick={() => { forget(draft) }}>{t('annotation.discardDraft')}</button>
    </div>)}
    {passage !== null && <Menu open anchor={null} portal compact side="top"
      getAnchorRect={() => passage.range.commonAncestorContainer.isConnected ? passage.range.getBoundingClientRect() : null}
      items={[{ id: 'add', label: t('annotation.add') }, { id: 'annotate', label: t('annotation.create') }]}
      onClose={() =>{  setPassage(null) }}
      onSelect={(id) => {
        if (id === 'annotate') { setCommenting(passage.annotation); setComment(drafts[draftKey(passage.annotation)]?.comment ?? ''); setPassage(null); return }
        if (addAnnotation(passage.annotation)) setPassage(null)
      }} />}
  </>
}
