// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MarkdownDelegateProvider } from '../src/markdown/MarkdownDelegate.tsx'
import { MarkdownText } from './markdown-test-components.tsx'

afterEach(() => { window.getSelection()?.removeAllRanges(); cleanup() })
function copy(element: Element, range: Range): Map<string, string> {
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  const data = new Map<string, string>()
  fireEvent.copy(element, { clipboardData: { setData: (type: string, value: string) => data.set(type, value) } })
  return data
}

it('copies selected headings and file links as Markdown and rich HTML with absolute paths and line numbers', () => {
  const view = render(<MarkdownDelegateProvider openFile={vi.fn()} resolveFileLink={path => `D:/Project/${path}`}>
    <MarkdownText text={'# Handoff\n\n[handoff.md](notes/handoff.md#L12) (250 lines)'} />
  </MarkdownDelegateProvider>)
  const root = view.container.firstElementChild!
  const range = document.createRange()
  range.selectNodeContents(root)
  const data = copy(root, range)
  expect(data.get('text/plain')).toBe('# Handoff\n\n[handoff.md](<D:/Project/notes/handoff.md#L12>) (250 lines)')
  expect(data.get('text/markdown')).toBe(data.get('text/plain'))
  expect(data.get('text/html')).toContain('href="file:///D:/Project/notes/handoff.md#L12"')
  expect(data.get('text/html')).not.toContain('<button')
  expect(data.get('text/html')).not.toContain('<svg')
})

it('keeps only the selected part of a file label while retaining its destination', () => {
  const view = render(<MarkdownDelegateProvider openFile={vi.fn()}>
    <MarkdownText text={'unselected [handoff.md](D:/Folder/My%20Note.md) after'} />
  </MarkdownDelegateProvider>)
  const root = view.container.firstElementChild!
  const link = view.getByRole('button', { name: 'handoff.md' })
  const text = [...link.childNodes].find(node => node.nodeType === Node.TEXT_NODE)!
  const range = document.createRange()
  range.setStart(text, 0); range.setEnd(text, 7)
  const data = copy(link, range)
  expect(data.get('text/plain')).toBe('[handoff](<D:/Folder/My%20Note.md>)')
  expect(data.get('text/plain')).not.toContain('unselected')
  expect(root.contains(link)).toBe(true)
})

it('retains web URLs but leaves ordinary text and empty selections to native copying', () => {
  const view = render(<MarkdownText text={'[docs](https://example.com/docs?q=a%20b)\n\nplain text'} />)
  const root = view.container.firstElementChild!
  const range = document.createRange()
  range.selectNodeContents(view.getByRole('link', { name: 'docs' }))
  expect(copy(root, range).get('text/plain')).toBe('[docs](<https://example.com/docs?q=a%20b>)')
  range.selectNodeContents(view.getByText('plain text'))
  expect(copy(root, range).size).toBe(0)
  range.collapse()
  expect(copy(root, range).size).toBe(0)
})

it('does not copy unselected siblings or intercept a selection that extends outside this Markdown owner', () => {
  const view = render(<div><MarkdownText text={'[docs](https://example.com)'} /><p>outside</p></div>)
  const root = view.getByRole('link').parentElement!.parentElement!
  const range = document.createRange()
  range.setStart(view.getByRole('link').firstChild!, 0)
  range.setEnd(view.getByText('outside').firstChild!, 3)
  expect(copy(root, range).size).toBe(0)
})

it('copies a selected response link even while an outside text input owns the copy event', () => {
  const view = render(<div><MarkdownText text={'[docs](https://example.com)'} /><textarea aria-label="composer" /></div>)
  const input = view.getByLabelText('composer')
  input.focus()
  const range = document.createRange()
  range.selectNodeContents(view.getByRole('link'))
  expect(copy(input, range).get('text/plain')).toBe('[docs](<https://example.com>)')
})
