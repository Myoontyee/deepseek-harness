// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MarkdownDelegateProvider } from '../src/markdown/MarkdownDelegate.tsx'
import { writeClipboard } from '../src/clipboard.ts'
import { markdownClipboardText } from '../src/markdown/clipboard-text.ts'
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

it('copies headings and file-link labels without presentation markers or destinations', () => {
  const view = render(<MarkdownDelegateProvider openFile={vi.fn()} resolveFileLink={path => `D:/Project/${path}`}>
    <MarkdownText text={'# Handoff\n\n[handoff.md](notes/handoff.md#L12) (250 lines)'} />
  </MarkdownDelegateProvider>)
  const root = view.container.firstElementChild!
  const range = document.createRange()
  range.selectNodeContents(root)
  const data = copy(root, range)
  expect(data.get('text/plain')).toBe('Handoff\n\nhandoff.md (250 lines)')
  expect(data.has('text/markdown')).toBe(false)
  expect(data.has('text/html')).toBe(false)
})

it('copies only the selected part of a file label', () => {
  const view = render(<MarkdownDelegateProvider openFile={vi.fn()}>
    <MarkdownText text={'unselected [handoff.md](D:/Folder/My%20Note.md) after'} />
  </MarkdownDelegateProvider>)
  const root = view.container.firstElementChild!
  const link = view.getByRole('button', { name: 'handoff.md' })
  const text = [...link.childNodes].find(node => node.nodeType === Node.TEXT_NODE)!
  const range = document.createRange()
  range.setStart(text, 0); range.setEnd(text, 7)
  const data = copy(link, range)
  expect(data.get('text/plain')).toBe('handoff')
  expect(data.get('text/plain')).not.toContain('unselected')
  expect(root.contains(link)).toBe(true)
})

it('copies link labels and plain content while leaving empty selections alone', () => {
  const view = render(<MarkdownText text={'[docs](https://example.com/docs?q=a%20b)\n\nplain text'} />)
  const root = view.container.firstElementChild!
  const range = document.createRange()
  range.selectNodeContents(view.getByRole('link', { name: 'docs' }))
  expect(copy(root, range).get('text/plain')).toBe('docs')
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
  expect(copy(input, range).get('text/plain')).toBe('docs')
})


it('copies Chinese content with each TeX formula once and no quote marker', () => {
  const text = String.raw`> 对缺陷像素集合 $D$ 与背景环 $B$，取灰度均值 $\mu_D$、$\mu_B$ 与背景标准差 $\sigma_B$。`
  const view = render(<MarkdownText text={text} />)
  const root = view.container.firstElementChild!
  const range = document.createRange()
  range.selectNodeContents(view.container.querySelector('blockquote')!)
  const data = copy(root, range)
  expect(data.get('text/plain')).toBe(text.slice(2))
  expect(data.has('text/markdown')).toBe(false)
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

it('strips prose styling and code fences while preserving code content and tables', () => {
  const view = render(<MarkdownText text={'## 标题\n\n**重点** 和 `code`\n\n1. first\n2. second\n\n```text\na_b\n\nb\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |'} />)
  const root = view.container.firstElementChild!
  const range = document.createRange()
  range.selectNodeContents(root)
  const text = copy(root, range).get('text/plain')!
  expect(text).toContain('标题')
  expect(text).not.toContain('##')
  expect(text).toContain('重点 和 code')
  expect(text).not.toContain('**')
  expect(text).toContain('first\nsecond')
  expect(text).toContain('a_b\n\nb')
  expect(text).not.toContain('```')
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


it.each([
  [
    '# 标题\n\n**重点** 与 *强调*、~~删除线~~、[链接](https://example.com)。',
    '标题\n\n重点 与 强调、删除线、链接。',
  ],
  [
    '> 引用\n\n- 第一项\n- 第二项\n\n---\n\n尾部',
    '引用\n\n第一项\n第二项\n\n尾部',
  ],
  [
    '```python\n  x = "**literal**"\n\n  y = 2\n```',
    '  x = "**literal**"\n\n  y = 2',
  ],
  [
    '均值 $\\mu_D$ 与 **背景** $\\mu_B$。',
    '均值 $\\mu_D$ 与 背景 $\\mu_B$。',
  ],
  [
    '公式 \\begin{equation} \\left\\{\\mu_D\\right\\} \\end{equation}',
    '公式 \\begin{equation} \\left\\{\\mu_D\\right\\} \\end{equation}',
  ],
  [
    '| **名称** | 值 |\n|---|---|\n| [平均](https://example.com) | $\\mu_D$ |',
    '| 名称 | 值 |\n| --- | --- |\n| 平均 | $\\mu_D$ |',
  ],
  [
    '\\*字面星号\\* 与 `a_b`',
    '*字面星号* 与 a_b',
  ],
])('projects full-message content without formatting: %s', (source, expected) => {
  expect(markdownClipboardText(source)).toBe(expected)
})

it('copies whitespace at the edge of a selected bold span without introducing Markdown markers', () => {
  const view = render(<MarkdownText text={'**重点 内容**'} />)
  const text = view.container.querySelector('strong')!.firstChild!
  const range = document.createRange()
  range.setStart(text, 0); range.setEnd(text, 3)
  expect(copy(view.container, range).get('text/plain')).toBe('重点 ')
})


it('does not overwrite an explicit copy-button fallback with a stale rendered selection', async () => {
  const view = render(<MarkdownText text="**旧选区**" />)
  const range = document.createRange()
  range.selectNodeContents(view.container.querySelector('strong')!)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  const originalExec = Object.getOwnPropertyDescriptor(document, 'execCommand')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  let intercepted = true
  let payload = ''
  Object.defineProperty(document, 'execCommand', { configurable: true, value: () => {
    payload = document.querySelector<HTMLTextAreaElement>('textarea[data-dsh-clipboard-write]')!.value
    const event = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { clearData: vi.fn(), setData: vi.fn() } })
    document.dispatchEvent(event)
    intercepted = event.defaultPrevented
    return true
  } })
  try {
    expect(await writeClipboard('完整回复')).toBe(true)
    expect(intercepted).toBe(false)
    expect(payload).toBe('完整回复')
    expect(document.querySelector('textarea[data-dsh-clipboard-write]')).toBeNull()
  } finally {
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else Reflect.deleteProperty(navigator, 'clipboard')
    if (originalExec) Object.defineProperty(document, 'execCommand', originalExec)
    else Reflect.deleteProperty(document, 'execCommand')
  }
})


it('uses the same TeX projection for rendered math fences and full-message copying', () => {
  const source = '```math.extra\n\\mu_D\n```'
  const expected = '$$\n\\mu_D\n$$'
  const view = render(<MarkdownText text={source} />)
  const range = document.createRange()
  range.selectNodeContents(view.container.firstElementChild!)
  expect(copy(view.container, range).get('text/plain')).toBe(expected)
  expect(markdownClipboardText(source)).toBe(expected)
})


it('keeps paragraph spacing consistent between selection and complete-message copying', () => {
  const source = '# 标题\n\n> **引用**\n\n正文\n\n| A | B |\n|---|---|\n| 1 | 2 |'
  const view = render(<MarkdownText text={source} />)
  const range = document.createRange()
  range.selectNodeContents(view.container.firstElementChild!)
  expect(copy(view.container, range).get('text/plain')).toBe(markdownClipboardText(source))
})


it('copies across registered Markdown regions without chrome, styling or duplicate formula glyphs', () => {
  const view = render(<div><MarkdownText text={String.raw`**first** $\mu_D$`} />
    <span>interface timestamp</span><button>interface action</button><MarkdownText text="## second" /></div>)
  const first = view.getByText('first').firstChild!
  const last = view.getByText('second').firstChild!
  const range = document.createRange()
  range.setStart(first, 0); range.setEnd(last, 6)
  const data = copy(view.container, range)
  expect(data.get('text/plain')).toBe('first $\\mu_D$\n\nsecond')
  expect(data.has('text/html')).toBe(false)
  expect(data.has('text/markdown')).toBe(false)
})
