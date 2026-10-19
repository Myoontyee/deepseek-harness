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
  fireEvent.click(view.getByRole('button', { name: '移除注释' }))
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

it('numbers serialized annotations in array order and states the independence rules in guidance', () => {
  const serialized = serializeResponseAnnotations('请求', [
    { ...quotation, text: '第一段' },
    { ...quotation, text: '第二段', comment: '第二条评论' },
  ])
  const payload = JSON.parse(serialized.slice('<dsh-response-annotations>\n'.length,
    serialized.indexOf('\n</dsh-response-annotations>\n\n'))) as {
    guidance: string
    annotations: ReadonlyArray<{ index: number }>
  }
  expect(payload.annotations.map(item => item.index)).toEqual([1, 2])
  expect(payload.guidance).toMatch(/ordered/i)
  expect(payload.guidance).toMatch(/independent/i)
  expect(payload.guidance).toMatch(/index/)
  expect(payload.guidance).toMatch(/empty comment/i)
  expect(payload.guidance).toMatch(/Never merge/i)
})

it('parses version-1 envelopes written before annotations carried an index', () => {
  const legacy = '<dsh-response-annotations>\n'
    + JSON.stringify({ version: 1, guidance: 'legacy guidance', annotations: [
      { text: '旧引文', comment: '旧评论', sourceUrl: 'dsh://session/old', sourceLabel: '旧来源', sourceMessage: 'm0' },
    ] })
    + '\n</dsh-response-annotations>\n\n旧请求'
  expect(parseResponseAnnotations(legacy)).toEqual({
    annotations: [{ text: '旧引文', comment: '旧评论', sourceUrl: 'dsh://session/old', sourceLabel: '旧来源', sourceMessage: 'm0' }],
    text: '旧请求',
  })
})

it('round-trips every annotation field and keeps the serialized index out of the result', () => {
  const annotations = [
    { text: '第一段', comment: '评论一', sourceUrl: 'dsh://session/a', sourceLabel: '来源A', sourceMessage: 'm1' },
    { text: '第二段', comment: '', sourceUrl: 'dsh://session/b', sourceLabel: '来源B', sourceMessage: 'm2' },
  ]
  expect(parseResponseAnnotations(serializeResponseAnnotations('正文', annotations)))
    .toEqual({ annotations, text: '正文' })
})


it('keeps comments when closing the editor and clears all annotations without changing the request', () => {
  const input = shell()
  input.setDraft('保留正文')
  input.actions.addAnnotation(quotation)
  input.actions.addAnnotation({ ...quotation, text: '第二条原文' })
  const props = () => ({ annotations: input.snapshot.annotations, actions: input.actions, disabled: false, t })
  const view = render(<AnnotationDrafts {...props()} />)
  fireEvent.click(view.getByRole('button', { name: '2 条注释' }))
  expect(view.getByText('第二条原文')).toBeTruthy()
  fireEvent.change(view.getAllByRole('textbox')[1]!, { target: { value: '第二条评论' } })
  view.rerender(<AnnotationDrafts {...props()} />)
  fireEvent.click(view.getByRole('button', { name: '完成' }))
  fireEvent.click(view.getByRole('button', { name: '2 条注释' }))
  expect((view.getAllByRole('textbox')[1] as HTMLTextAreaElement).value).toBe('第二条评论')
  fireEvent.click(view.getByRole('button', { name: '完成' }))
  fireEvent.click(view.getByRole('button', { name: '清空所有注释' }))
  expect(input.snapshot.annotations).toEqual([])
  expect(input.snapshot.draft).toBe('保留正文')
  view.rerender(<AnnotationDrafts {...props()} />)
  expect(view.queryByRole('dialog')).toBeNull()
  input.actions.addAnnotation(quotation)
  view.rerender(<AnnotationDrafts {...props()} />)
  expect(view.queryByRole('dialog')).toBeNull()
  input.dispose()
})

it('allows reading annotations while submission has locked edits', () => {
  const input = shell()
  input.actions.addAnnotation(quotation)
  const view = render(<AnnotationDrafts annotations={input.snapshot.annotations} actions={input.actions} disabled t={t} />)
  expect((view.getByRole('button', { name: '清空所有注释' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(view.getByRole('button', { name: '1 条注释' }))
  expect(view.getByText('保留原文')).toBeTruthy()
  expect((view.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true)
  expect((view.getByRole('button', { name: '移除注释' }) as HTMLButtonElement).disabled).toBe(true)
  input.dispose()
})

it.each(['button', 'keyboard', 'escape', 'draft'])('adds a direct comment with preserved quotation using %s', (method) => {
  const container = document.createElement('div')
  container.innerHTML = '<div data-chat-node-key="math1"><strong>引用</strong><span data-copy-math="CNR &lt; 1"><span>C</span><span>N</span><span>R</span><span aria-hidden="true">CNR</span></span></div>'
  document.body.append(container)
  onTestFinished(() => { container.remove() })
  const addAnnotation = vi.fn(() => true)
  const view = render(<SelectionAnnotation container={container} sessionId="source" addAnnotation={addAnnotation} t={t} />)
  const range = document.createRange()
  range.selectNodeContents(container.firstElementChild!)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(40, 80, 120, 20) })
  fireEvent.pointerUp(container.firstElementChild!)
  fireEvent.click(view.getByText('添加注释'))
  expect(addAnnotation).not.toHaveBeenCalled()
  expect(view.getByRole('dialog').querySelector('details')?.open).toBe(true)
  expect(view.getByRole('dialog').textContent).toContain('引用')
  if (method === 'escape') {
    fireEvent.keyDown(view.getByRole('textbox', { name: '补充评论（可选）' }), { key: 'Escape' })
    expect(view.queryByRole('dialog')).toBeNull()
    expect(addAnnotation).not.toHaveBeenCalled()
    return
  }
  fireEvent.change(view.getByRole('textbox', { name: '补充评论（可选）' }), { target: { value: '这是我的备注' } })
  if (method === 'draft') {
    fireEvent.click(view.getByRole('dialog').previousElementSibling!)
    expect(view.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(view.getByRole('textbox', { name: '补充评论（可选）' }), { key: 'Escape' })
    expect(view.queryByRole('dialog')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: /继续编辑暂存注释/ }))
    expect(view.getByRole('textbox', { name: '补充评论（可选）' })).toHaveProperty('value', '这是我的备注')
  }
  const editor = view.getByRole('textbox', { name: '补充评论（可选）' })
  fireEvent.keyDown(editor, { key: 'Enter' })
  fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true, isComposing: true })
  fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true, repeat: true })
  expect(addAnnotation).not.toHaveBeenCalled()
  if (method === 'keyboard') fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
  else fireEvent.click(view.getByRole('button', { name: '添加注释' }))
  expect(view.queryByRole('button', { name: /继续编辑暂存注释/ })).toBeNull()
  expect(addAnnotation).toHaveBeenCalledWith(expect.objectContaining({
    text: '**引用**$CNR < 1$', comment: '这是我的备注', sourceMessage: 'math1',
  }))
})
