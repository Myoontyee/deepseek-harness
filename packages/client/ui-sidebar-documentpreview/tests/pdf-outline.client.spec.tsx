// @vitest-environment jsdom
/** Internal bookmarks, failure containment, and stale-navigation cancellation. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { PdfOutline } from '../src/client/pdf/PdfOutline.tsx'
import { outlinePage, type PdfOutlineItems } from '../src/client/pdf/outline.ts'
import type { PdfDocument } from '../src/client/pdf/document.ts'
import { en } from '../src/client/pdf/locales.ts'

afterEach(cleanup)
const t = makeTranslate(en)
function bookmark(title: string, dest: PdfOutlineItems[number]['dest'], items: PdfOutlineItems = []): PdfOutlineItems[number] {
  return { title, dest, items, bold: false, italic: false, color: new Uint8ClampedArray(3), url: null,
    unsafeUrl: undefined, newWindow: undefined, count: undefined }
}
function documentOf(): PdfDocument {
  return { numPages: 3, getPage: vi.fn(), getOutline: vi.fn(async () => [bookmark('Chapter one', [0], [bookmark('Details', 'details')])]),
    getDestination: vi.fn(async () => [{ num: 9, gen: 0 }]), getPageIndex: vi.fn(async () => 2) }
}

it('resolves explicit, named, and indirect destinations and rejects invalid pages', async () => {
  const document = documentOf(), signal = new AbortController().signal
  expect(await outlinePage(document, [0], signal)).toBe(1)
  expect(await outlinePage(document, 'details', signal)).toBe(3)
  expect(document.getPageIndex).toHaveBeenCalledWith({ num: 9, gen: 0 })
  for (const invalid of [null, [], [-1], [3], [0.5], [{}], [{ num: '9', gen: 0 }]]) {
    expect(await outlinePage(document, invalid, signal)).toBeNull()
  }
})

it('shows a nested outline, navigates by keyboard-compatible buttons, and can collapse', async () => {
  const onNavigate = vi.fn()
  render(<PdfOutline document={documentOf()} signal={new AbortController().signal} onNavigate={onNavigate} t={t} />)
  const toggle = screen.getByRole('button', { name: en.outline })
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(toggle)
  await act(async () => {})
  expect(screen.getAllByRole('list')).toHaveLength(2)
  const chapterToggle = screen.getByRole('button', { name: 'Expand or collapse Chapter one' })
  fireEvent.click(chapterToggle)
  expect(screen.queryByRole('button', { name: 'Details' })).toBeNull()
  fireEvent.click(chapterToggle)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Details' })) })
  expect(onNavigate).toHaveBeenCalledWith(3)
  fireEvent.click(toggle)
  expect(screen.queryByRole('button', { name: 'Details' })).toBeNull()
})

it('keeps the PDF viewport beside the outline and restores focus when Escape closes it', async () => {
  render(<PdfOutline document={documentOf()} signal={new AbortController().signal} onNavigate={vi.fn()} t={t}>
    <div data-pdf-page-content>PDF pages remain mounted</div>
  </PdfOutline>)
  const toggle = screen.getByRole('button', { name: en.outline })
  fireEvent.click(toggle)
  await act(async () => {})
  const outline = screen.getByRole('complementary', { name: en.outline })
  expect(outline.parentElement?.querySelector('[data-pdf-pages-viewport] [data-pdf-page-content]')).toBeTruthy()
  expect(fireEvent.keyDown(screen.getByRole('button', { name: 'Details' }), { key: 'Escape' })).toBe(false)
  expect(screen.queryByRole('complementary', { name: en.outline })).toBeNull()
  expect(document.activeElement).toBe(toggle)
  expect(screen.getByText('PDF pages remain mounted')).toBeTruthy()
})

it('announces an absent outline and retries a failed outline without affecting pages', async () => {
  const document = documentOf()
  vi.mocked(document.getOutline).mockRejectedValueOnce(new Error('bad outline')).mockResolvedValueOnce([])
  render(<PdfOutline document={document} signal={new AbortController().signal} onNavigate={vi.fn()} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: en.outline }))
  await act(async () => {})
  expect(screen.getByRole('alert').textContent).toContain(en.outlineFailed)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.retry })) })
  expect(screen.getByText(en.outlineEmpty)).toBeTruthy()
})

it('does not follow external bookmarks or let a late navigation win after another click or unmount', async () => {
  const document = documentOf(), onNavigate = vi.fn()
  const pending = Promise.withResolvers<Awaited<ReturnType<PdfDocument['getDestination']>>>()
  vi.mocked(document.getOutline).mockResolvedValue([bookmark('Slow', 'slow'), bookmark('Now', [1]), bookmark('External', null)])
  vi.mocked(document.getDestination).mockReturnValue(pending.promise)
  const view = render(<PdfOutline document={document} signal={new AbortController().signal} onNavigate={onNavigate} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: en.outline }))
  await act(async () => {})
  expect(screen.getByRole('button', { name: 'External' })).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('button', { name: 'Slow' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Now' })) })
  view.unmount()
  await act(async () => { pending.resolve([0]) })
  expect(onNavigate.mock.calls).toEqual([[2]])
})

it('reports a broken destination and refuses navigation after the tab closes', async () => {
  const document = documentOf(), onNavigate = vi.fn(), controller = new AbortController()
  vi.mocked(document.getDestination).mockRejectedValue(new Error('missing destination'))
  render(<PdfOutline document={document} signal={controller.signal} onNavigate={onNavigate} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: en.outline }))
  await act(async () => {})
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Details' })) })
  expect(screen.getByRole('alert').textContent).toBe(en.outlineNavigationFailed)
  controller.abort()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Chapter one' })) })
  expect(onNavigate).not.toHaveBeenCalled()
})
