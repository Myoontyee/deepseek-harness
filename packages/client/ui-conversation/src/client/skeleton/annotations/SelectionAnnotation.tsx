/** Text-selection action scoped to one conversation transcript. */
import { useEffect, useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ResponseAnnotation } from '@deepseek-ai/dsh-client-ui-primitives'
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
  const [passage, setPassage] = useState<SelectedPassage | null>(null)
  useEffect(() => {
    if (container === null) return
    const clear = (): void =>{  setPassage(null) }
    const capture = (): void => {
      const selection = container.ownerDocument.getSelection()
      if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {  clear(); return }
      const owner = messageOwner(selection.anchorNode)
      if (owner === null || !container.contains(owner) || owner !== messageOwner(selection.focusNode)) {  clear(); return }
      const text = selection.toString()
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
  if (passage === null) return null
  return (
    <Menu open anchor={null} portal compact side="top"
      getAnchorRect={() => passage.range.commonAncestorContainer.isConnected ? passage.range.getBoundingClientRect() : null}
      items={[{ id: 'annotate', label: t('annotation.add') }]}
      onClose={() =>{  setPassage(null) }}
      onSelect={() => {
        if (addAnnotation(passage.annotation)) setPassage(null)
      }} />
  )
}
