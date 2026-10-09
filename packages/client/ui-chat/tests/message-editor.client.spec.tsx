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

it('retains text after failure and retries the edited text through Save', async () => {
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


it('saves the current draft with Ctrl+Enter without bubbling or submitting twice while pending', async () => {
  let complete!: () => void
  const onSave = vi.fn(() => new Promise<void>((resolve) => { complete = resolve }))
  const onCancel = vi.fn()
  const outerShortcut = vi.fn()
  const view = render(<div onKeyDown={outerShortcut}><MessageEditor text="原文" allowEmpty={false} disabled={false}
    annotationCount={0} onSave={onSave} onCancel={onCancel} t={t} /></div>)
  const input = view.getByLabelText('编辑消息')
  fireEvent.change(input, { target: { value: '快捷键修改稿' } })
  expect(fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })).toBe(false)
  expect(onSave).toHaveBeenCalledExactlyOnceWith('快捷键修改稿')
  expect(outerShortcut).not.toHaveBeenCalled()
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true, repeat: true })
  expect(onSave).toHaveBeenCalledOnce()
  complete()
  await waitFor(() => { expect(onCancel).toHaveBeenCalledOnce() })
})

it('keeps Enter as a newline and leaves Chinese composition unsubmitted until committed', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const onCancel = vi.fn()
  const view = render(<MessageEditor text="中文修改稿" allowEmpty={false} disabled={false} annotationCount={0}
    onSave={onSave} onCancel={onCancel} t={t} />)
  const input = view.getByLabelText('编辑消息')
  expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(true)
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true, isComposing: true })
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true, keyCode: 229 })
  fireEvent.compositionStart(input)
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
  expect(onSave).not.toHaveBeenCalled()
  fireEvent.compositionEnd(input)
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
  await waitFor(() => { expect(onCancel).toHaveBeenCalledOnce() })
  expect(onSave).toHaveBeenCalledExactlyOnceWith('中文修改稿')
})

it.each([{ text: '', disabled: false }, { text: '有效内容', disabled: true }])('refuses keyboard submission when the Save button is disabled (%j)', ({ text, disabled }) => {
  const onSave = vi.fn()
  const view = render(<MessageEditor text={text} allowEmpty={false} disabled={disabled} annotationCount={0}
    onSave={onSave} onCancel={vi.fn()} t={t} />)
  fireEvent.keyDown(view.getByLabelText('编辑消息'), { key: 'Enter', ctrlKey: true })
  expect(onSave).not.toHaveBeenCalled()
})
