// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { UserContent } from '../src/client/chat/UserContent.tsx'
import { markdownLabels } from '../src/client/markdown-labels.ts'
import { zh } from '../src/client/locale.ts'
import { zh as common } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

afterEach(() => { window.getSelection()?.removeAllRanges(); cleanup() })

it('preserves literal user text and TeX when a selection crosses the new user-content factory', () => {
  const t = makeTranslate(zh, common)
  const props = {
    content: { text: '**literal**', attachments: [], extraBlocks: [] }, facts: {}, t,
    renderFactorySlot: (_name: string, input: { text: string }) => input.text,
  } as Parameters<typeof UserContent>[0]
  const view = render(<div><UserContent {...props} />
    <MarkdownText text={'**reply** $\\mu_D$'} labels={markdownLabels(t)} /></div>)
  const user = view.getByText('**literal**').firstChild!
  const reply = view.getByText('reply').closest('p')!
  const range = document.createRange()
  range.setStart(user, 0)
  range.setEndAfter(reply)
  window.getSelection()?.addRange(range)
  const data = new Map<string, string>()
  fireEvent.copy(view.container, { clipboardData: {
    clearData: () => { data.clear() },
    setData: (type: string, value: string) => data.set(type, value),
  } })
  expect(data.get('text/plain')).toBe('**literal**\n\nreply $\\mu_D$')
})
