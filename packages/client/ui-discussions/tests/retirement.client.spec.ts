/** Retired discussion tabs close without disturbing ordinary documents or transcript labels. */
import { expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply } from '../src/client/plugin.tsx'

it('keeps historical labels, closes only retired tabs and stops observing after disposal', async () => {
  const mounted = createSnapshotStore('first'), openTabs = createSnapshotStore(0)
  const rows = new Map([
    ['first', [{ id: 'old', kind: 'discussionboard' }, { id: 'file', kind: 'document' }]],
    ['second', [{ id: 'second-old', kind: 'discussionboard' }]],
  ])
  const disposers: (() => void)[] = []
  const identities = vi.fn(() => () => {}), labels = vi.fn(() => () => {})
  const close = vi.fn((id: string) => {
    const session = mounted.getSnapshot()
    rows.set(session, (rows.get(session) ?? []).filter(tab => tab.id !== id))
    openTabs.set(openTabs.getSnapshot() + 1)
  })
  apply({ uiConversation: { events: { register: identities }, userText: { register: labels } },
    sidebarRight: { mounted, openTabs, tabsIn: (session: string) => rows.get(session) ?? [], close },
    effect(effect: () => (() => void)) { disposers.push(effect()) },
  } as never)
  await Promise.resolve()
  expect(close).toHaveBeenCalledWith('old')
  expect(close).not.toHaveBeenCalledWith('file')
  expect(identities).toHaveBeenCalledOnce()
  expect(labels).toHaveBeenCalledOnce()
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
