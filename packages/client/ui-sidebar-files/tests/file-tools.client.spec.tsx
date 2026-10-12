// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { FileTools } from '../src/client/FileTools.tsx'
import { relativeFilePath, parentFilePath } from '../src/client/file-actions.ts'
import type { FileActions } from '../src/client/file-actions.ts'
import { zh } from '../src/client/locales.ts'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
afterEach(() => {
  cleanup(); vi.restoreAllMocks()
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
})
function setup() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const actions: FileActions = {
    notify: vi.fn(),
    change: vi.fn().mockResolvedValue(''), search: vi.fn().mockResolvedValue({ matches: [], truncated: false }),
    reveal: vi.fn().mockResolvedValue(undefined), terminal: vi.fn().mockResolvedValue(undefined),
    open: vi.fn(), locate: vi.fn(), add: vi.fn(), remember: vi.fn(), clearClipboard: vi.fn(), clipboard: () => undefined,
  }
  const view = render(<FileTools root={'D:\\project'} fileActions={actions} t={makeTranslate(zh)}>
    <ul><li data-files-entry="file" data-files-path={'D:\\project\\中文.md'}><button type="button">中文.md</button></li></ul>
    <input aria-label="editor" />
  </FileTools>)
  return { view, actions, writeText, row: view.getByRole('button', { name: '中文.md' }) }
}
it('copies a relative path with Ctrl+Shift+C and leaves text inputs alone', async () => {
  const { row, view, writeText } = setup()
  fireEvent.focus(row)
  fireEvent.keyDown(row, { code: 'KeyC', ctrlKey: true, shiftKey: true })
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('中文.md'))
  writeText.mockClear()
  fireEvent.keyDown(view.getByRole('textbox'), { code: 'KeyC', ctrlKey: true, shiftKey: true })
  expect(writeText).not.toHaveBeenCalled()
})
it('requires confirmation before moving a file to the trash', async () => {
  const { row, view, actions } = setup()
  fireEvent.focus(row); fireEvent.keyDown(row, { code: 'Delete' })
  expect(actions.change).not.toHaveBeenCalled()
  fireEvent.click(view.getByRole('button', { name: '确定' }))
  await waitFor(() => expect(actions.change).toHaveBeenCalledWith({ operation: 'trash', path: 'D:\\project\\中文.md' }))
})
it('supports drive roots and preserves case in relative paths', () => {
  expect(relativeFilePath('D:\\Project', 'd:/project/目录/A.txt')).toBe('目录/A.txt')
  expect(relativeFilePath('D:\\', 'D:\\a.txt')).toBe('a.txt')
  expect(relativeFilePath('/home/a', '/home/ab/file')).toBe('/home/ab/file')
  expect(parentFilePath('D:\\a.txt')).toBe('D:\\')
})
