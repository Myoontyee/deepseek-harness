// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { MessageContextMenu, quoteIntoDraft } from '../src/client/chat/MessageContextMenu.tsx'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh, commonZh)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

describe('quoteIntoDraft', () => {
  it('prefixes every line with a quote marker', () => {
    expect(quoteIntoDraft('', 'a\nb')).toBe('> a\n> b')
  })

  it('keeps a non-empty draft above the quoted block', () => {
    expect(quoteIntoDraft('draft', 'a\nb')).toBe('draft\n\n> a\n> b')
  })
})

describe('MessageContextMenu', () => {
  const writeText = () => (navigator.clipboard.writeText as ReturnType<typeof vi.fn>)

  it('right-click opens a menu at the pointer with copy/copy-markdown/quote/edit; selection closes it', () => {
    const onEdit = vi.fn()
    const onQuote = vi.fn()
    const view = render(
      <MessageContextMenu text="hello" markdown="**hello**" onEdit={onEdit} onQuote={onQuote} t={t}>
        <span>row</span>
      </MessageContextMenu>,
    )
    fireEvent.contextMenu(view.getByText('row'), { clientX: 40, clientY: 132 })
    const menu = screen.getByRole('menu')
    expect(menu.style.left).toBe('40px')
    expect(menu.style.top).toBe('136px')
    expect(screen.getByRole('menuitem', { name: '复制' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: '复制为 Markdown' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: '引用' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: '编辑' })).toBeDefined()
    fireEvent.click(screen.getByRole('menuitem', { name: '编辑' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('copy writes the plain text and shows the success chip', async () => {
    const view = render(
      <MessageContextMenu text="hello" markdown="**hello**" onQuote={() => {}} t={t}>
        <span>row</span>
      </MessageContextMenu>,
    )
    fireEvent.contextMenu(view.getByText('row'), { clientX: 10, clientY: 10 })
    fireEvent.click(screen.getByRole('menuitem', { name: '复制' }))
    expect(writeText()).toHaveBeenCalledWith('hello')
    await waitFor(() => expect(screen.getByText('复制成功')).toBeDefined())
  })

  it('copy-as-markdown writes the markdown source', () => {
    const view = render(
      <MessageContextMenu text="hello" markdown="**hello**" onQuote={() => {}} t={t}>
        <span>row</span>
      </MessageContextMenu>,
    )
    fireEvent.contextMenu(view.getByText('row'), { clientX: 10, clientY: 10 })
    fireEvent.click(screen.getByRole('menuitem', { name: '复制为 Markdown' }))
    expect(writeText()).toHaveBeenCalledWith('**hello**')
  })

  it('quote invokes the callback; Escape and outside pointerdown close without selecting', () => {
    const onQuote = vi.fn()
    const view = render(
      <MessageContextMenu text="hello" onQuote={onQuote} t={t}>
        <span>row</span>
      </MessageContextMenu>,
    )
    // Without markdown there is no copy-as-markdown item.
    fireEvent.contextMenu(view.getByText('row'), { clientX: 10, clientY: 10 })
    expect(screen.queryByRole('menuitem', { name: '复制为 Markdown' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: '编辑' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: '引用' }))
    expect(onQuote).toHaveBeenCalledTimes(1)
    fireEvent.contextMenu(view.getByText('row'), { clientX: 10, clientY: 10 })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.contextMenu(view.getByText('row'), { clientX: 10, clientY: 10 })
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('keyboard Enter selects the active first item (copy); the menu is roving-focus navigable', () => {
    const view = render(
      <MessageContextMenu text="hello" markdown="**hello**" onQuote={() => {}} t={t}>
        <span>row</span>
      </MessageContextMenu>,
    )
    fireEvent.contextMenu(view.getByText('row'), { clientX: 10, clientY: 10 })
    const menu = screen.getByRole('menu')
    expect(document.querySelector<HTMLElement>('[data-menu-active]')?.textContent).toBe('复制')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.querySelector<HTMLElement>('[data-menu-active]')?.textContent).toBe('复制为 Markdown')
    fireEvent.keyDown(menu, { key: 'Enter' })
    expect(writeText()).toHaveBeenCalledWith('**hello**')
  })

  it('a refused clipboard write shows no success chip', async () => {
    const view = render(
      <MessageContextMenu text="hello" onQuote={() => {}} t={t}>
        <span>row</span>
      </MessageContextMenu>,
    )
    writeText().mockRejectedValueOnce(new Error('denied'))
    fireEvent.contextMenu(view.getByText('row'), { clientX: 10, clientY: 10 })
    fireEvent.click(screen.getByRole('menuitem', { name: '复制' }))
    await waitFor(() => expect(writeText()).toHaveBeenCalledWith('hello'))
    expect(screen.queryByText('复制成功')).toBeNull()
  })

  it('a live selection yields to the selection menu (no row menu opens)', () => {
    const spy = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'sel' } as unknown as Selection)
    try {
      const view = render(
        <MessageContextMenu text="hello" onQuote={() => {}} t={t}>
          <span>row</span>
        </MessageContextMenu>,
      )
      fireEvent.contextMenu(view.getByText('row'), { clientX: 10, clientY: 10 })
      expect(screen.queryByRole('menu')).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })
})
