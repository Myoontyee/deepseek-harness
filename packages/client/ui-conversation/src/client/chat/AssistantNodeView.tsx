import { memo, useMemo } from 'react'
import type { ChatNodeViewProps, TurnTailOwnerProps } from '../contract/slots.ts'
import { extractMarkdownPlainText } from '@deepseek-ai/dsh-client-ui-primitives'
import { AssistantMarkdown } from './AssistantMarkdown.tsx'
import { MessageContextMenu, quoteIntoDraft } from './MessageContextMenu.tsx'

/** Join the assistant's markdown text blocks into one copyable source. */
function assistantMarkdown(blocks: readonly { kind: string; text?: string }[]): string {
  return blocks
    .filter(block => block.kind === 'text' && typeof block.text === 'string')
    .map(block => block.text as string)
    .join('\n\n')
}

/** Streaming, settled, and interrupted Assistant states share one keyed renderer instance. */
export const AssistantNodeView = memo(function AssistantNodeView({
  node, useTurnData, openFile, loadImage, fileMentions, useInput, inputActions, t,
}: ChatNodeViewProps<'assistant-step'>) {
  const data = node.data
  const turn = node.location.kind === 'turn' || node.location.kind === 'step'
    ? node.location.turn
    : undefined
  const tail = useTurnData('turn-tail')
  const owner = useMemo<TurnTailOwnerProps | undefined>(() => {
    if (turn?.status !== 'closed' || data.finalNode === undefined) return undefined
    if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return undefined
    return { turn, seq: data.finalNode.seq, openFile }
  }, [data.finalNode, openFile, tail, turn])
  const mentions = useMemo(
    () => owner === undefined ? undefined : fileMentions(owner),
    [fileMentions, owner],
  )
  const markdown = useMemo(() => assistantMarkdown(data.blocks), [data.blocks])
  const text = useMemo(() => extractMarkdownPlainText(markdown), [markdown])
  const draft = useInput(state => state.draft)
  return (
    <MessageContextMenu
      text={text}
      markdown={markdown}
      onQuote={() => inputActions.setDraft(quoteIntoDraft(draft, markdown))}
      t={t}
    >
      <AssistantMarkdown
        blocks={data.blocks}
        streaming={data.status === 'running'}
        interrupted={data.status === 'interrupted'}
        loadImage={loadImage}
        mentions={mentions}
        t={t}
      />
    </MessageContextMenu>
  )
})
