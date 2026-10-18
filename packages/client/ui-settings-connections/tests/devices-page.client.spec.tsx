// @vitest-environment jsdom
/** Device rows preserve machine names, status distinctions and pairing targets. */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DevicesPage } from '../src/client/DevicesPage.tsx'
import type {} from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
it('shows named peers and only offers computer-initiated pairing for online computers', async () => {
  const deviceCommand = vi.fn(async () => true)
  const useDevices: ComponentProps<typeof DevicesPage>['useDevices'] = selector => selector({
    catalog: { detect: true, warning: '', peers: [
      { id: 'self', name: '3070-laptop', address: '100.80.1.1', os: 'windows', online: true, self: true },
      { id: 'server', name: '4090-server', address: '100.80.1.2', os: 'windows', online: true, self: false },
      { id: 'phone', name: 'vivo-s18pro', address: '100.80.1.3', os: 'android', online: true, self: false },
      { id: 'mac', name: 'macbook-air', address: '100.80.1.4', os: 'macos', online: true, self: false },
      { id: 'offline', name: 'offline-pc', address: '100.80.1.5', os: 'windows', online: false, self: false },
    ], paired: [{ id: 'saved', name: 'Server', address: '100.80.1.2' }] },
    sessions: { saved: [] }, failures: {}, busy: false, error: '', phones: [], phone: undefined,
  })
  const view = render(<DevicesPage useDevices={useDevices} deviceCommand={deviceCommand}
    watchDevices={() => () => {}} maskPhoneText={text => text} t={makeTranslate(zh)} />)
  const table = view.getByRole('table')
  expect(within(table).getAllByRole('columnheader').map(node => node.textContent)).toEqual([
    '设备名称', '网络地址', '系统', '连接状态', '操作',
  ])
  const server = within(table).getByRole('row', { name: /4090-server/ })
  expect(within(server).getByText('DSH 已连接')).toBeDefined()
  expect(within(server).queryByRole('button')).toBeNull()
  const phone = within(table).getByRole('row', { name: /vivo-s18pro/ })
  expect(within(phone).getByText('在线，尚未验证 DSH')).toBeDefined()
  expect(within(phone).queryByRole('button')).toBeNull()
  expect(within(phone).getByText('请在手机中发起连接')).toBeDefined()
  const offline = within(table).getByRole('row', { name: /offline-pc/ })
  expect(within(offline).getByRole('button')).toHaveProperty('disabled', true)
  fireEvent.click(within(within(table).getByRole('row', { name: /macbook-air/ })).getByRole('button', { name: '配对此设备' }))
  await waitFor(() => { expect(deviceCommand).toHaveBeenCalledWith('pairTailnet', { id: 'mac' }) })
  expect(deviceCommand.mock.calls[0]).toEqual(['probeTailnet', { id: 'mac' }])
  expect(view.getByLabelText('设备名称')).toHaveProperty('value', '')
})

it('shows the approval wait and lets the operator cancel without entering a code', async () => {
  let finish!: (ok: boolean) => void
  const deviceCommand: ComponentProps<typeof DevicesPage>['deviceCommand'] = vi.fn(async (action) => {
    if (action === 'pairTailnet') return new Promise<boolean>((resolve) => { finish = resolve })
    if (action === 'cancelPairTailnet') finish(false)
    return true
  })
  const useDevices: ComponentProps<typeof DevicesPage>['useDevices'] = selector => selector({
    catalog: { detect: true, warning: '', peers: [
      { id: 'server', name: '4090-server', address: '100.80.1.2', os: 'windows', online: true, self: false },
    ], paired: [] }, sessions: {}, failures: {}, busy: false, error: '', phones: [], phone: undefined,
  })
  const view = render(<DevicesPage useDevices={useDevices} deviceCommand={deviceCommand}
    watchDevices={() => () => {}} maskPhoneText={text => text} t={makeTranslate(zh)} />)
  fireEvent.click(view.getByRole('button', { name: '配对此设备' }))
  await waitFor(() => { expect(view.getByRole('status').textContent).toMatch(/等待.*4090-server/u) })
  fireEvent.click(view.getByRole('button', { name: '取消' }))
  await waitFor(() => { expect(view.queryByRole('status')).toBeNull() })
  expect(deviceCommand).toHaveBeenCalledWith('cancelPairTailnet')
})
