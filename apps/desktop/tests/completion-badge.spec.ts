import { expect, it, vi } from 'vitest'
import { CompletionBadge, parseCompletionReport } from '../src/completion-badge.ts'

it('counts unseen completions once, acknowledges only the viewed conversation, and ignores secondary duplicates', () => {
  const render = vi.fn()
  const badge = new CompletionBadge(render)
  const report = (running: boolean, selected: string | null = 'b') => ({ selected, ready: true,
    sessions: [{ id: 'a', running }, { id: 'b', running: false }] })
  badge.focus(1)
  badge.report(1, report(false), true)
  expect(badge.count).toBe(0)
  badge.report(1, report(true), true)
  badge.report(1, report(false), true)
  badge.report(1, report(false), true)
  expect(badge.count).toBe(1)
  expect(render).toHaveBeenCalledTimes(1)
  badge.report(2, report(false, 'a'), false)
  expect(badge.count).toBe(1)
  badge.focus(2)
  expect(badge.count).toBe(0)
  badge.report(2, report(true, 'a'), false)
  badge.report(1, report(false), true)
  expect(badge.count).toBe(0)
  badge.report(1, report(true), true)
  badge.report(1, report(false), true)
  expect(badge.count).toBe(0)
  badge.blur(2)
  badge.report(1, report(true), true)
  badge.report(1, report(false), true)
  expect(badge.count).toBe(1)
  badge.remove(2)
  badge.focus(1)
  expect(badge.count).toBe(1)
  badge.report(1, report(false, 'a'), true)
  expect(badge.count).toBe(0)
})

it('clears completed entries removed from a ready catalog without treating initial idle entries as new completions', () => {
  const badge = new CompletionBadge(() => {})
  badge.report(1, { selected: null, ready: true, sessions: [{ id: 'a', running: true }] }, true)
  badge.report(1, { selected: null, ready: true, sessions: [{ id: 'a', running: false }] }, true)
  expect(badge.count).toBe(1)
  badge.report(1, { selected: null, ready: false, sessions: [] }, true)
  expect(badge.count).toBe(1)
  badge.report(1, { selected: null, ready: true, sessions: [] }, true)
  expect(badge.count).toBe(0)
})

it('validates the native IPC report', () => {
  expect(parseCompletionReport({ selected: 'a', ready: true, sessions: [{ id: 'a', running: true }] })).not.toBeNull()
  for (const input of [null, {}, { selected: '', ready: true, sessions: [] },
    { selected: null, ready: true, sessions: [{ id: 'a', running: 'yes' }] },
    { selected: null, ready: true, sessions: [{ id: 'a', running: true }, { id: 'a', running: false }] }]) {
    expect(parseCompletionReport(input)).toBeNull()
  }
})
