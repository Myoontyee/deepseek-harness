// @vitest-environment jsdom
/** Remote folder membership, duplicate IDs and offline rows remain device-scoped. */
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type {} from '../src/client/index.ts'
import { RemoteWorkspaces } from '../src/client/RemoteWorkspaces.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
it('opens the selected device conversation and keeps disconnected folders readable', () => {
  const command = vi.fn(async () => true)
  const useDevices: ComponentProps<typeof RemoteWorkspaces>['useDevices'] = select => select({
    catalog: { detect: true, peers: [], warning: '', paired: ['a', 'b'].map(id => ({ id, name: id, address: id })) },
    sessions: { a: [{ id: 'same', title: 'Alpha', running: false, workspaceId: 'work' }],
      b: [{ id: 'same', title: 'Beta', running: false, workspaceId: 'work' }] },
    workspaces: { a: [{ id: 'work', title: 'Research', path: '/research' }], b: [{ id: 'work', title: 'Research', path: '/research' }] },
    failures: { b: 'Offline' }, busy: false, error: '', phones: [], phone: undefined,
  })
  const view = render(<RemoteWorkspaces useDevices={useDevices} deviceCommand={command} watchDevices={() => () => {}}
    maskPhoneText={text => text} t={makeTranslate(zh)} query="" archivedFilter="default" />)
  for (const row of view.getAllByRole('button', { name: 'Research' })) fireEvent.click(row)
  fireEvent.click(view.getByRole('button', { name: 'Alpha' }))
  expect(command).toHaveBeenCalledWith('open', { id: 'a', sessionId: 'same' })
  expect(view.getByRole('button', { name: 'Beta' })).toHaveProperty('disabled', true)
  fireEvent.click(view.getByRole('button', { name: '重新连接 · b' }))
  expect(command).toHaveBeenCalledWith('refreshDevice', { id: 'b' })
  expect(within(view.getByRole('region')).getByText('未连接')).toBeDefined()
})

it('creates a conversation on a remote folder and registers a remote absolute path', async () => {
  const command = vi.fn(async () => true)
  const useDevices: ComponentProps<typeof RemoteWorkspaces>['useDevices'] = select => select({
    catalog: { detect: true, peers: [], warning: '', paired: [{ id: 'a', name: 'Server', address: 'a' }] },
    sessions: {}, workspaces: { a: [{ id: 'work', title: 'Research', path: 'D:\\research' }] },
    failures: {}, busy: false, error: '', phones: [], phone: undefined,
  })
  const view = render(<RemoteWorkspaces useDevices={useDevices} deviceCommand={command} watchDevices={() => () => {}}
    maskPhoneText={text => text} t={makeTranslate(zh)} query="" archivedFilter="default" />)
  fireEvent.contextMenu(view.getByRole('button', { name: 'Research' }))
  fireEvent.click(view.getByRole('menuitem', { name: '新建对话' }))
  expect(command).toHaveBeenCalledWith('createConversation', { id: 'a', workspaceId: 'work' })

  fireEvent.contextMenu(view.getByRole('button', { name: 'Server' }))
  fireEvent.click(view.getByRole('menuitem', { name: '添加项目' }))
  const input = view.getByRole('textbox')
  fireEvent.change(input, { target: { value: 'D:\\new-project' } })
  fireEvent.click(view.getByRole('button', { name: '添加' }))
  await vi.waitFor(() => {
    expect(command).toHaveBeenCalledWith('createWorkspace', { id: 'a', path: 'D:\\new-project' })
  })
})
