// @vitest-environment jsdom
/** Device rows preserve machine names, status distinctions and pairing targets. */
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DevicesPage } from '../src/client/DevicesPage.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
it('shows named peers in separate columns and pairs the chosen name', () => {
  const deviceCommand = vi.fn(async () => true)
  const useDevices: ComponentProps<typeof DevicesPage>['useDevices'] = selector => selector({
    catalog: { detect: true, warning: '', peers: [
      { id: 'self', name: '3070-laptop', address: '100.80.1.1', os: 'windows', online: true, self: true },
      { id: 'server', name: '4090-server', address: '100.80.1.2', os: 'windows', online: true, self: false },
      { id: 'phone', name: 'vivo-s18pro', address: '100.80.1.3', os: 'android', online: true, self: false },
    ], paired: [{ id: 'saved', name: 'Server', address: '100.80.1.2' }] },
    sessions: { saved: [] }, failures: {}, busy: false, error: '',
  })
  const view = render(<DevicesPage useDevices={useDevices} deviceCommand={deviceCommand}
    watchDevices={() => () => {}} t={makeTranslate(zh)} />)
  const table = view.getByRole('table')
  expect(within(table).getAllByRole('columnheader').map(node => node.textContent)).toEqual([
    '设备名称', '网络地址', '系统', '连接状态', '操作',
  ])
  const server = within(table).getByRole('row', { name: /4090-server/ })
  expect(within(server).getByText('DSH 已连接')).toBeDefined()
  expect(within(server).queryByRole('button')).toBeNull()
  const phone = within(table).getByRole('row', { name: /vivo-s18pro/ })
  expect(within(phone).getByText('在线，尚未验证 DSH')).toBeDefined()
  fireEvent.click(within(phone).getByRole('button', { name: '配对此设备' }))
  expect(view.getByLabelText('设备名称')).toHaveProperty('value', 'vivo-s18pro')
})
