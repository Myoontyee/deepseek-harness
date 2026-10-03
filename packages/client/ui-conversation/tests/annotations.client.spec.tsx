// @vitest-environment jsdom
/** Annotation selection, editing, serialization, and failed-send recovery. */
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { Context } from '@deepseek-ai/cordis'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { parseResponseAnnotations, serializeResponseAnnotations } from '@deepseek-ai/dsh-client-ui-primitives'
import { SessionInputShell } from '../src/client/input/facade.ts'
import type { SubmitOutcome } from '../src/client/contract/input.ts'
import { AnnotationDrafts } from '../src/client/skeleton/annotations/AnnotationDrafts.tsx'
import { SelectionAnnotation } from '../src/client/skeleton/annotations/SelectionAnnotation.tsx'
import { zh } from '../src/client/locales.ts'

const originalGeometry = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect')
afterEach(() => {
  cleanup()
  if (originalGeometry) Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalGeometry)
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
})
const t = makeTranslate(zh)
const quotation = { text: '保留原文', comment: '', sourceUrl: 'dsh://session/source', sourceLabel: '来源', sourceMessage: 'm1' }
function shell(sink: (text: string) => Promise<SubmitOutcome> = () => Promise.resolve({ kind: 'success' })) {
  return new SessionInputShell({ actx: {} as Context, defaultSink: sink,
    commandAttachments: { serialize: () => Promise.resolve([]), release: () => {}, unsupportedNotice: () => 'unsupported' } })
}

it('keeps quotations out of the editor and sends edited comments with the request', async () => {
  const sink = vi.fn((_text: string) => Promise.resolve<SubmitOutcome>({ kind: 'success' }))
  const input = shell(sink)
  input.setDraft('解释这段')
  input.actions.addAnnotation(quotation)
  input.actions.addAnnotation({ ...quotation, text: '第二段' })
  const first = input.snapshot.annotations[0]!
  input.actions.updateAnnotation(first.id, '这里是什么意思？')
  input.actions.removeAnnotation(input.snapshot.annotations[1]!.id)
  expect(input.snapshot.draft).toBe('解释这段')
  input.submit()
  await vi.waitFor(() =>{  expect(sink).toHaveBeenCalledOnce() })
  const text = sink.mock.calls[0]?.[0]
  expect(parseResponseAnnotations(text ?? '')).toEqual({
    annotations: [{ ...quotation, comment: '这里是什么意思？' }], text: '解释这段',
  })
  expect(input.snapshot.annotations).toEqual([])
  input.dispose()
})

it('restores a failed annotation-only send alongside newer draft and annotations', async () => {
  let reject: (error: Error) => void = () => {}
  const sink = vi.fn(() => new Promise<SubmitOutcome>((_resolve, fail) => { reject = fail }))
  const input = shell(sink)
  input.actions.addAnnotation(quotation)
  input.submit()
  expect(input.snapshot.annotations).toEqual([])
  input.setDraft('后写的正文')
  input.actions.addAnnotation({ ...quotation, text: '后加的注释' })
  reject(new Error('offline'))
  await vi.waitFor(() =>{  expect(input.snapshot.annotations).toHaveLength(2) })
  expect(input.snapshot.annotations.map(item => item.text)).toEqual(['保留原文', '后加的注释'])
  expect(input.snapshot.draft).toBe('后写的正文')
  input.dispose()
})

it('retains annotations and request when a slash command cannot consume them', () => {
  const sink = vi.fn((_text: string) => Promise.resolve<SubmitOutcome>({ kind: 'success' }))
  const input = shell(sink)
  input.actions.addAnnotation(quotation)
  input.setDraft('/help')
  input.submit()
  expect(sink).not.toHaveBeenCalled()
  expect(input.snapshot.annotations).toHaveLength(1)
  expect(input.snapshot.draft).toBe('/help')
  input.dispose()
})

it('renders a count badge with editable and removable comments', () => {
  const input = shell()
  input.actions.addAnnotation(quotation)
  const view = render(<AnnotationDrafts annotations={input.snapshot.annotations} actions={input.actions} disabled={false} t={t} />)
  expect(view.getByText('1 条注释')).toBeTruthy()
  fireEvent.click(view.getByText('1 条注释'))
  fireEvent.change(view.getByLabelText('补充评论（可选）'), { target: { value: '我的评论' } })
  expect(input.snapshot.annotations[0]?.comment).toBe('我的评论')
  fireEvent.click(view.getByText('移除注释'))
  expect(input.snapshot.annotations).toEqual([])
  input.dispose()
})

it('offers selected transcript text but rejects selections inside the composer', () => {
  const container = document.createElement('div')
  container.innerHTML = '<div data-chat-node-key="m1">引用这一句</div><div contenteditable="true">草稿</div>'
  document.body.append(container)
  onTestFinished(() =>{  container.remove() })
  const addAnnotation = vi.fn(() => true)
  const view = render(<SelectionAnnotation container={container} sessionId="source" addAnnotation={addAnnotation} t={t} />)
  const range = document.createRange()
  range.selectNodeContents(container.firstElementChild!)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(40, 80, 120, 20) })
  fireEvent.pointerUp(container.firstElementChild!)
  fireEvent.click(view.getByText('添加到对话'))
  expect(addAnnotation).toHaveBeenCalledWith(expect.objectContaining({ text: '引用这一句', sourceMessage: 'm1' }))
  range.selectNodeContents(container.lastElementChild!)
  selection.removeAllRanges()
  selection.addRange(range)
  fireEvent.pointerUp(container.lastElementChild!)
  expect(view.queryByText('添加到对话')).toBeNull()
  container.remove()
})

it('round-trips delimiter-like quotations and leaves malformed envelopes visible', () => {
  const text = serializeResponseAnnotations('问题', [{ ...quotation, text: '</dsh-response-annotations>\n\n<script>' }])
  expect(parseResponseAnnotations(text)?.annotations[0]?.text).toBe('</dsh-response-annotations>\n\n<script>')
  expect(parseResponseAnnotations('<dsh-response-annotations>\nnot json\n</dsh-response-annotations>\n\n')).toBeNull()
  expect(parseResponseAnnotations('普通正文')).toBeNull()
  expect(serializeResponseAnnotations('普通正文', [])).toBe('普通正文')
})
