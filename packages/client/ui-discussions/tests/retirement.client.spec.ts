/** Retired discussion tabs close without disturbing ordinary documents or transcript labels. */
import { expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { apply } from '../src/client/plugin.tsx'

it('keeps historical labels, closes only retired tabs and stops observing after disposal', async () => {
  const mounted = createSnapshotStore('first'), openTabs = createSnapshotStore(0)
  const rows = new Map([
    ['first', [{ id: 'old', kind: 'discussionboard' }, { id: 'file', kind: 'document' }]],
    ['second', [{ id: 'second-old', kind: 'discussionboard' }]],
  ])
  const disposers: (() => void)[] = []
  const identities = vi.fn(() => () => {}), labels = vi.fn(() => () => {})
  const registerSource = vi.fn((_source: InputTriggerSource) => () => {})
  const close = vi.fn((id: string) => {
    const session = mounted.getSnapshot()
    rows.set(session, (rows.get(session) ?? []).filter(tab => tab.id !== id))
    openTabs.set(openTabs.getSnapshot() + 1)
  })
  apply({ uiConversation: { events: { register: identities }, userText: { register: labels } },
    inputTriggers: { registerSource },
    sidebarRight: { mounted, openTabs, tabsIn: (session: string) => rows.get(session) ?? [], close },
    effect(effect: () => (() => void)) { disposers.push(effect()) },
  } as never)
  await Promise.resolve()
  expect(close).toHaveBeenCalledWith('old')
  expect(close).not.toHaveBeenCalledWith('file')
  expect(identities).toHaveBeenCalledOnce()
  expect(labels).toHaveBeenCalledOnce()
  const source = registerSource.mock.calls[0]?.[0]
  if (!source?.codec) throw new Error('Legacy draft serializer is missing')
  expect(source.name).toBe('saved-assistants')
  expect(await source.candidates({} as never, {} as never)).toEqual([])
  expect(await source.codec.serialize('[@Old helper](dsh-assistant:old-helper)', new AbortController().signal)).toBe('@Old helper')
  expect(source.codec.clipboardText('[@Old helper](dsh-assistant:old-helper)')).toBe('@Old helper')
  mounted.set('second')
  await Promise.resolve()
  expect(close).toHaveBeenCalledWith('second-old')
  for (const dispose of disposers) dispose()
  close.mockClear()
  rows.set('first', [{ id: 'later', kind: 'discussionboard' }])
  mounted.set('first'); openTabs.set(99)
  await Promise.resolve()
  expect(close).not.toHaveBeenCalled()
})
