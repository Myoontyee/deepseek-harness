/** Offline peers and disposed views must not corrupt another computer's conversation list. */
import { expect, it, vi } from 'vitest'
import { createDeviceActions } from '../src/client/devices.ts'

it('keeps equal session IDs separate by device and contains one offline peer', async () => {
  const actions = createDeviceActions(async (action, args) => {
    if (action === 'list') return { detect: true, peers: [], warning: '', paired: ['a', 'b', 'offline'].map(id => ({ id, name: id, address: '100.80.1.1' })) }
    if (action === 'phoneConversations') return []
    if (args?.id === 'offline') throw new Error('Offline')
    return [{ id: 'same-session-id', title: args?.id, running: false }]
  })
  try {
    expect(await actions.deviceCommand('refresh')).toBe(true)
    const value = actions.hooks.devices.getSnapshot()
    expect(value.sessions.a?.[0]?.title).toBe('a')
    expect(value.sessions.b?.[0]?.title).toBe('b')
    expect(value.failures.offline).toBe('Offline')
  } finally { actions.dispose() }
})

it('previews synchronized phone copies without opening a remote operator window', async () => {
  const transcript = { id: 'phone/account/chat', device: 'Phone', title: 'Research', updated: 1, messages: [{ role: 'user', text: 'Question', model: '', thinking: '' }], annotations: [{ quote: '$x$', comment: 'note' }] }
  const invoke = vi.fn(async (action: string) => {
    if (action === 'list') return { detect: false, peers: [], warning: '', paired: [] }
    if (action === 'phoneConversations') return [transcript]
    if (action === 'readPhoneConversation') return transcript
    throw new Error('Unexpected operation')
  })
  const actions = createDeviceActions(invoke)
  try {
    expect(await actions.deviceCommand('refresh')).toBe(true)
    expect(actions.hooks.devices.getSnapshot().phones[0]?.title).toBe('Research')
    expect(await actions.deviceCommand('readPhoneConversation', { id: transcript.id })).toBe(true)
    expect(actions.hooks.devices.getSnapshot().phone?.annotations[0]?.comment).toBe('note')
    expect(invoke.mock.calls.some(([action]) => action === 'open')).toBe(false)
  } finally { actions.dispose() }
})

it('does not publish a delayed inventory after disposal', async () => {
  let finish!: (value: unknown) => void
  const actions = createDeviceActions(() => new Promise((resolve) => { finish = resolve }))
  const listener = vi.fn()
  const unsubscribe = actions.hooks.devices.subscribe(listener)
  const pending = actions.deviceCommand('refresh')
  actions.dispose()
  const count = listener.mock.calls.length
  finish({ detect: true, peers: [], paired: [], warning: '' })
  await pending
  expect(listener.mock.calls.length).toBe(count)
  expect(actions.hooks.devices.getSnapshot().catalog.detect).toBe(false)
  unsubscribe()
})
