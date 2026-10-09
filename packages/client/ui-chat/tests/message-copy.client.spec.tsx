// @vitest-environment jsdom
/** Message copy applies the same content-only policy as rendered selections. */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh } from '../src/client/locale.ts'
import { zh as common } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { MessageIconActions } from '../src/client/chat/MessageIconActions.tsx'

const t = makeTranslate(zh, common)
afterEach(cleanup)
it('copies an entire Markdown reply as text with TeX and a plain-cell Markdown table', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const text = '# 标题\n\n**重点** $\\mu_D$\n\n| **A** | B |\n|---|---|\n| [内容](https://example.com) | 2 |'
  const view = render(<MessageIconActions text={text} markdown clock="end" t={t} />)
  fireEvent.click(view.getByRole('button', { name: '复制' }))
  expect(writeText).toHaveBeenCalledExactlyOnceWith('标题\n\n重点 $\\mu_D$\n\n| A | B |\n| --- | --- |\n| 内容 | 2 |')
  await waitFor(() => { expect(view.getByRole('button', { name: '复制成功' })).toBeTruthy() })
})
it('preserves symbols that are literal content in an unformatted user bubble', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const text = '**literal** and a_b'
  const view = render(<MessageIconActions text={text} clock="start" t={t} />)
  fireEvent.click(view.getByRole('button', { name: '复制' }))
  expect(writeText).toHaveBeenCalledExactlyOnceWith(text)
  await waitFor(() => { expect(view.getByRole('button', { name: '复制成功' })).toBeTruthy() })
})
