/** Native unread-completion count shared by every product window. */

import type { CompletionReport } from './ipc.ts'

/** @param value - Untrusted IPC argument. @returns A validated report, or null. */
export function parseCompletionReport(value: unknown): CompletionReport | null {
  if (typeof value !== 'object' || value === null || !('selected' in value) || !('ready' in value)
    || typeof value.ready !== 'boolean' || !('sessions' in value) || !Array.isArray(value.sessions)) return null
  const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 512
    && !/[\u0000-\u001f\u007f]/u.test(id)
  if (value.selected !== null && !validId(value.selected)) return null
  const entries: readonly unknown[] = value.sessions
  const sessions: { id: string; running: boolean }[] = []
  const ids = new Set<string>()
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null || !('id' in entry) || !validId(entry.id)
      || !('running' in entry) || typeof entry.running !== 'boolean' || ids.has(entry.id)) return null
    ids.add(entry.id)
    sessions.push({ id: entry.id, running: entry.running })
  }
  return { selected: value.selected, ready: value.ready, sessions }
}

/** Counts each completion once; any focused product window can acknowledge it. */
export class CompletionBadge {
  private readonly running = new Map<string, boolean>()
  private readonly unread = new Set<string>()
  private readonly selections = new Map<number, string | null>()
  private focused: number | null = null
  private published = 0
  /** @param render - Paint the native count after it changes. */
  constructor(private readonly render: (count: number) => void) {}
  /** Number of conversations with an unacknowledged completion. */
  get count(): number { return this.unread.size }
  /** @param windowId - Sender. @param report - Validated state. @param primary - Sole completion observer. */
  report(windowId: number, report: CompletionReport, primary: boolean): void {
    this.selections.set(windowId, report.selected)
    if (primary) {
      const present = new Set<string>()
      for (const { id, running } of report.sessions) {
        present.add(id)
        const previous = this.running.get(id)
        this.running.set(id, running)
        if (running) this.unread.delete(id)
        else if (previous === true && this.viewed() !== id) this.unread.add(id)
      }
      if (report.ready) for (const id of this.running.keys()) {
        if (present.has(id)) continue
        this.running.delete(id)
        this.unread.delete(id)
      }
    }
    this.acknowledge()
  }
  /** @param windowId - Product window which now owns keyboard focus. */
  focus(windowId: number): void { this.focused = windowId; this.acknowledge() }
  /** @param windowId - Product window which lost focus. */
  blur(windowId: number): void { if (this.focused === windowId) this.focused = null }
  /** @param windowId - Destroyed product window. */
  remove(windowId: number): void { this.blur(windowId); this.selections.delete(windowId) }
  private viewed(): string | null { return this.focused === null ? null : this.selections.get(this.focused) ?? null }
  private acknowledge(): void {
    const viewed = this.viewed()
    if (viewed !== null) this.unread.delete(viewed)
    if (this.published === this.count) return
    this.published = this.count
    this.render(this.count)
  }
}

const DIGITS: Readonly<Record<string, readonly string[]>> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'],
}

/** @param count - Positive unread count. @returns A 32 by 32 BGRA bitmap for NativeImage. */
export function completionBadgeBitmap(count: number): Buffer {
  const pixels = Buffer.alloc(32 * 32 * 4)
  for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
    if ((x - 15.5) ** 2 + (y - 15.5) ** 2 <= 15 ** 2) pixels[(y * 32 + x) * 4 + 3] = 255
  }
  const text = count > 99 ? '99+' : String(count)
  const scale = text.length === 1 ? 4 : 2
  const left = Math.floor((32 - (text.length * 4 - 1) * scale) / 2)
  const top = Math.floor((32 - 5 * scale) / 2)
  for (const [index, digit] of text.split('').entries()) {
    const glyph = DIGITS[digit]
    if (glyph === undefined) continue
    for (const [row, line] of glyph.entries()) for (const [column, bit] of line.split('').entries()) {
      if (bit !== '1') continue
      for (let dy = 0; dy < scale; dy += 1) for (let dx = 0; dx < scale; dx += 1) {
        const offset = ((top + row * scale + dy) * 32 + left + (index * 4 + column) * scale + dx) * 4
        pixels.fill(255, offset, offset + 4)
      }
    }
  }
  return pixels
}
