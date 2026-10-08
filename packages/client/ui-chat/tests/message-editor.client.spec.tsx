// @vitest-environment jsdom
/** Inline sent-message editing retains failed drafts and explicit cancellation. */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh } from '../src/client/locale.ts'
import { zh as common } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { MessageEditor } from '../src/client/chat/MessageEditor.tsx'
afterEach(cleanup)
const t = makeTranslate(zh, common)

it('retains text after failure and resubmits the edited text only when Save is clicked', async () => {
  const onSave = vi.fn<(text: string) => Promise<void>>()
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
  const onCancel = vi.fn()
  const view = render(<MessageEditor text="旧消息" allowEmpty={false} disabled={false} annotationCount={1}
    onSave={onSave} onCancel={onCancel} t={t} />)
  fireEvent.change(view.getByLabelText('编辑消息'), { target: { value: '改后的消息' } })
  expect(onSave).not.toHaveBeenCalled()
  fireEvent.click(view.getByText('保存并重新生成'))
  await waitFor(() =>{  expect(view.getByRole('alert').textContent).toContain('修改内容已保留') })
  expect((view.getByLabelText('编辑消息') as HTMLTextAreaElement).value).toBe('改后的消息')
  expect(onCancel).not.toHaveBeenCalled()
  fireEvent.click(view.getByText('保存并重新生成'))
  await waitFor(() =>{  expect(onCancel).toHaveBeenCalledOnce() })
  expect(onSave).toHaveBeenLastCalledWith('改后的消息')
})

it('cancels without sending and refuses empty ordinary messages', () => {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  const view = render(<MessageEditor text="" allowEmpty={false} disabled={false} annotationCount={0}
    onSave={onSave} onCancel={onCancel} t={t} />)
  expect((view.getByText('保存并重新生成') as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(view.getByText('取消'))
  expect(onCancel).toHaveBeenCalledOnce()
  expect(onSave).not.toHaveBeenCalled()
})
