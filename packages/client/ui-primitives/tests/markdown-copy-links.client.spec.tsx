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
  fireEvent.copy(element, { clipboardData: {
    clearData: () => { data.clear() },
    setData: (type: string, value: string) => data.set(type, value),
  } })
  return data
}

it('copies selected headings and file links as Markdown source with absolute paths and line numbers', () => {
  const view = render(<MarkdownDelegateProvider openFile={vi.fn()} resolveFileLink={path => `D:/Project/${path}`}>
    <MarkdownText text={'# Handoff\n\n[handoff.md](notes/handoff.md#L12) (250 lines)'} />
  </MarkdownDelegateProvider>)
  const root = view.container.firstElementChild!
  const range = document.createRange()
  range.selectNodeContents(root)
  const data = copy(root, range)
  expect(data.get('text/plain')).toBe('# Handoff\n\n[handoff.md](<D:/Project/notes/handoff.md#L12>) (250 lines)')
  expect(data.get('text/markdown')).toBe(data.get('text/plain'))
  expect(data.has('text/html')).toBe(false)
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

it('retains web URLs and plain Markdown while leaving empty selections alone', () => {
  const view = render(<MarkdownText text={'[docs](https://example.com/docs?q=a%20b)\n\nplain text'} />)
  const root = view.container.firstElementChild!
  const range = document.createRange()
  range.selectNodeContents(view.getByRole('link', { name: 'docs' }))
  expect(copy(root, range).get('text/plain')).toBe('[docs](<https://example.com/docs?q=a%20b>)')
  range.selectNodeContents(view.getByText('plain text'))
  expect(copy(root, range).get('text/plain')).toBe('plain text')
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


it('copies the selected Chinese passage with each TeX formula once and preserves quote structure', () => {
  const text = String.raw`> 对缺陷像素集合 $D$ 与背景环 $B$，取灰度均值 $\mu_D$、$\mu_B$ 与背景标准差 $\sigma_B$。`
  const view = render(<MarkdownText text={text} />)
  const root = view.container.firstElementChild!
  const range = document.createRange()
  range.selectNodeContents(view.container.querySelector('blockquote')!)
  const data = copy(root, range)
  expect(data.get('text/plain')).toBe(text)
  expect(data.get('text/markdown')).toBe(text)
  expect(data.has('text/html')).toBe(false)
  expect(data.get('text/plain')).not.toContain('μ')
})

it('copies display equations and a selection within a rendered subscript from their original source', () => {
  const source = String.raw`c=\frac{\lvert\mu_D-\mu_B\rvert}{\mu_B}`
  const view = render(<MarkdownText text={`before\n\n$$\n${source}\n$$\n\nafter`} />)
  const root = view.container.firstElementChild!
  const formula = view.container.querySelector('[data-copy-math]')!
  const glyph = formula.querySelector('.katex-html .mord')!
  const range = document.createRange()
  range.selectNodeContents(glyph)
  expect(copy(root, range).get('text/plain')).toBe(`$$\n${source}\n$$`)
  expect(copy(root, range).get('text/plain')).not.toContain('before')
})

it('preserves inline math when selection starts in its visual layer and ends in surrounding text', () => {
  const view = render(<MarkdownText text={String.raw`前文 $\mu_D$ 后文 111`} />)
  const root = view.container.firstElementChild!
  const glyph = view.container.querySelector('.katex-html .mord')!
  const paragraph = view.container.querySelector('p')!
  const range = document.createRange()
  range.setStart(glyph.firstChild!, 0)
  range.setEnd(paragraph.lastChild!, (paragraph.lastChild!.textContent ?? '').length)
  expect(copy(root, range).get('text/plain')).toBe(String.raw`$\mu_D$ 后文 111`)
})

it('retains heading, emphasis, ordered lists, code fences and tables without needing a link', () => {
  const view = render(<MarkdownText text={'## 标题\n\n**重点** 和 `code`\n\n1. first\n2. second\n\n```text\na_b\n\nb\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |'} />)
  const root = view.container.firstElementChild!
  const range = document.createRange()
  range.selectNodeContents(root)
  const text = copy(root, range).get('text/plain')!
  expect(text).toContain('## 标题')
  expect(text).toContain('**重点** 和 `code`')
  expect(text).toContain('1. first\n2. second')
  expect(text).toContain('```text\na_b\n\nb\n```')
  expect(text).toContain('| A | B |\n| --- | --- |\n| 1 | 2 |')
  expect(text).not.toContain('Copy')
})

it('keeps a literal equation environment readable without doubling its TeX command backslashes', () => {
  const source = String.raw`公式 \begin{equation} c=\frac{\lvert\mu_D-\mu_B\rvert}{\mu_B},\quad CNR=\frac{a}{\sigma_{B}} \end{equation}`
  const view = render(<MarkdownText text={source} />)
  const root = view.container.firstElementChild!
  const range = document.createRange()
  range.selectNodeContents(root)
  expect(copy(root, range).get('text/plain')).toBe(source)
})


it('preserves TeX delimiters and subscripts before a streamed formula is rendered', () => {
  const source = String.raw`还在生成：$\mu_D$、$\mu_B$ 与 $\sigma_{B}$。`
  const view = render(<MarkdownText text={source} streaming />)
  const root = view.container.firstElementChild!
  const range = document.createRange()
  range.selectNodeContents(root)
  expect(copy(root, range).get('text/plain')).toBe(source)
})
