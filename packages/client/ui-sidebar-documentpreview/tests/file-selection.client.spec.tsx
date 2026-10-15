// @vitest-environment jsdom
/** File quotations preserve their source and never silently discard a busy draft. */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { FileSelection } from '../src/client/FileSelection.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup(); window.getSelection()?.removeAllRanges(); vi.restoreAllMocks() })
function select(element: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(element)
  const selection = window.getSelection()!
  selection.removeAllRanges(); selection.addRange(range)
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(40, 80, 120, 20) })
  fireEvent.pointerUp(element)
}
function mount(accept = true) {
  const add = vi.fn(() => accept)
  const view = render(<FileSelection sourceUrl="file://session/docs/test.md" sourceLabel="D:/docs/test.md" addAnnotation={add} t={makeTranslate(zh)}>
    <p data-testid="quote">Some <strong>bold</strong> <span data-copy-math="CNR < 1">duplicated rendered math</span> <a href="https://example.com">link</a></p>
    <textarea data-testid="editor" defaultValue="Do not quote editable input" />
  </FileSelection>)
  return { add, view }
}
it('adds the visible selection with Markdown math and the file source', () => {
  const { view, add } = mount()
  select(view.getByTestId('quote'))
  fireEvent.click(view.getByRole('menuitem', { name: '添加到对话' }))
  expect(add).toHaveBeenCalledWith({ text: 'Some **bold** $CNR < 1$ [link](<https://example.com>)', comment: '', sourceUrl: 'file://session/docs/test.md', sourceLabel: 'D:/docs/test.md', sourceMessage: 'D:/docs/test.md' })
})
it('keeps a remark separate from the quote and retains it after refused admission', () => {
  const { view, add } = mount(false)
  select(view.getByTestId('quote'))
  fireEvent.click(view.getByRole('menuitem', { name: '添加注释' }))
  fireEvent.change(view.getByRole('textbox', { name: '输入备注' }), { target: { value: 'Please revise this section' } })
  fireEvent.click(view.getByRole('button', { name: '添加到对话' }))
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ comment: 'Please revise this section', text: expect.stringContaining('$CNR < 1$') }))
  expect(view.getByRole('textbox', { name: '输入备注' })).toHaveProperty('value', 'Please revise this section')
  expect(view.getByRole('alert').textContent).toContain('暂时无法')
})
it('ignores editable input', () => {
  const { view, add } = mount()
  select(view.getByTestId('editor'))
  expect(view.queryByRole('menuitem')).toBeNull()
  expect(add).not.toHaveBeenCalled()
})

it('supports Escape cancellation and Ctrl+Enter submission without swallowing normal typing', () => {
  const { view, add } = mount()
  const open = () => {
    select(view.getByTestId('quote'))
    fireEvent.click(view.getByRole('menuitem', { name: '添加注释' }))
    return view.getByRole('textbox', { name: '输入备注' })
  }
  let editor = open()
  fireEvent.keyDown(editor, { key: 'Escape' })
  expect(view.queryByRole('dialog')).toBeNull()
  expect(add).not.toHaveBeenCalled()
  editor = open()
  fireEvent.change(editor, { target: { value: 'Keyboard remark' } })
  fireEvent.keyDown(editor, { key: 'Enter' })
  fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true, isComposing: true })
  fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true, repeat: true })
  expect(add).not.toHaveBeenCalled()
  fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
  expect(add).toHaveBeenCalledTimes(1)
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ comment: 'Keyboard remark' }))
  expect(view.queryByRole('dialog')).toBeNull()
})
