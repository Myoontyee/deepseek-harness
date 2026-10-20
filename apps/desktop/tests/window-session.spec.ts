import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  clampWindowBounds, MAX_SAVED_WINDOWS, parseSavedWindow, parseSessionId, parseWindowSessionDocument,
  WINDOW_SESSION_VERSION, WindowSessionStore, type SavedWindow, type WindowBounds,
} from '../src/window-session.ts'

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

const display: WindowBounds = { x: 0, y: 0, width: 1920, height: 1080 }
const secondDisplay: WindowBounds = { x: 1920, y: 0, width: 1280, height: 1024 }

function saved(sessionId: string, bounds: Partial<WindowBounds> = {}): SavedWindow {
  return { sessionId, bounds: { x: 100, y: 100, width: 900, height: 700, ...bounds } }
}

function fixture() {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-window-session-'))
  onTestFinished(() => { rmSync(userData, { recursive: true, force: true }) })
  const directory = join(userData, 'desktop')
  mkdirSync(directory)
  return { userData, directory, path: join(directory, 'window-state.json') }
}

describe('parseSessionId', () => {
  it.each(['session-1', '会话', 'a'.repeat(512)] as const)('accepts %s', (value) => {
    expect(parseSessionId(value)).toBe(value)
  })

  it.each([
    undefined, null, 42, {}, '', 'a'.repeat(513), 'line\nbreak', 'null\u0000byte', 'del\u007f',
  ])('rejects %s', (value) => {
    expect(parseSessionId(value)).toBeUndefined()
  })
})

describe('parseSavedWindow', () => {
  it('accepts safe integer bounds', () => {
    expect(parseSavedWindow(saved('session-1'))).toEqual(saved('session-1'))
  })

  it('drops fields outside the saved-window document contract', () => {
    expect(parseSavedWindow({ sessionId: 'session-1', bounds: { x: 1, y: 2, width: 900, height: 700, extra: true }, tag: 'ignored' }))
      .toEqual({ sessionId: 'session-1', bounds: { x: 1, y: 2, width: 900, height: 700 } })
  })

  it.each([
    { sessionId: 'session-1' },
    { sessionId: 'session-1', bounds: { x: 0, y: 0, width: 0, height: 700 } },
    { sessionId: 'session-1', bounds: { x: 0, y: 0, width: 900, height: -1 } },
    { sessionId: 'session-1', bounds: { x: 0.5, y: 0, width: 900, height: 700 } },
    { sessionId: 'session-1', bounds: { x: Number.MAX_SAFE_INTEGER, y: 0, width: 900, height: 700 } },
    { sessionId: 'session-1', bounds: 'wide' },
  ])('rejects malformed entry %o', (entry) => {
    expect(parseSavedWindow(entry)).toBeUndefined()
  })
})

describe('parseWindowSessionDocument', () => {
  it('reads version 1 windows in document order', () => {
    expect(parseWindowSessionDocument({
      version: WINDOW_SESSION_VERSION, windows: [saved('first'), saved('second')],
    })).toEqual([saved('first'), saved('second')])
  })

  it.each([
    null, [], {}, { version: 2, windows: [saved('session-1')] }, { version: 1 }, { version: 1, windows: {} },
  ])('treats a wrong envelope as no saved windows: %o', (value) => {
    expect(parseWindowSessionDocument(value)).toEqual([])
  })

  it('skips invalid entries and duplicates without dropping valid later ones', () => {
    expect(parseWindowSessionDocument({
      version: 1,
      windows: [saved('first'), { sessionId: '' }, 'text', saved('first'), saved('second')],
    })).toEqual([saved('first'), saved('second')])
  })

  it(`caps the restored set at ${MAX_SAVED_WINDOWS} windows`, () => {
    const windows = Array.from({ length: MAX_SAVED_WINDOWS + 3 }, (_, index) => saved(`session-${index}`))
    const parsed = parseWindowSessionDocument({ version: 1, windows })
    expect(parsed.map(window => window.sessionId)).toEqual(windows.slice(0, MAX_SAVED_WINDOWS).map(window => window.sessionId))
  })
})

describe('clampWindowBounds', () => {
  it('keeps an on-screen rectangle unchanged', () => {
    expect(clampWindowBounds(saved('session-1').bounds, [display])).toEqual({ x: 100, y: 100, width: 900, height: 700 })
  })

  it('enforces the minimum window size', () => {
    expect(clampWindowBounds({ x: 10, y: 10, width: 200, height: 100 }, [display]))
      .toEqual({ x: 10, y: 10, width: 520, height: 600 })
  })

  it('pulls a rectangle beyond the right and bottom edges back inside', () => {
    expect(clampWindowBounds({ x: 3000, y: 2000, width: 900, height: 700 }, [display]))
      .toEqual({ x: 1020, y: 380, width: 900, height: 700 })
  })

  it('chooses the display the saved rectangle overlaps most', () => {
    const spanning = { x: 1800, y: 100, width: 900, height: 700 }
    expect(clampWindowBounds(spanning, [display, secondDisplay]))
      .toEqual({ x: 1920, y: 100, width: 900, height: 700 })
  })

  it('moves a rectangle that overlaps no display onto the nearest one', () => {
    expect(clampWindowBounds({ x: 5000, y: 300, width: 900, height: 700 }, [display, secondDisplay]))
      .toEqual({ x: 2300, y: 300, width: 900, height: 700 })
  })

  it('returns nothing without a connected display', () => {
    expect(clampWindowBounds(saved('session-1').bounds, [])).toBeUndefined()
  })
})

describe('WindowSessionStore', () => {
  it('reads no saved windows when the document is absent', () => {
    const { userData } = fixture()
    expect(new WindowSessionStore(userData).read()).toEqual([])
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('skips an unreadable document with a diagnostic', () => {
    const { userData, path } = fixture()
    writeFileSync(path, '{')
    expect(new WindowSessionStore(userData).read()).toEqual([])
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(path), expect.any(Error))
  })

  it('writes the current set atomically and reads it back', async () => {
    const { userData, path } = fixture()
    const store = new WindowSessionStore(userData)
    store.replace([saved('first'), saved('second')])
    await store.flush()
    store.dispose()
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      version: WINDOW_SESSION_VERSION,
      windows: [saved('first'), saved('second')],
    })
    expect(new WindowSessionStore(userData).read()).toEqual([saved('first'), saved('second')])
  })

  it('writes a changed set after the debounce', async () => {
    const { userData, path } = fixture()
    const store = new WindowSessionStore(userData, { debounceMs: 1 })
    store.replace([saved('debounced')])
    onTestFinished(() => { store.dispose() })
    await vi.waitFor(() => {
      expect((JSON.parse(readFileSync(path, 'utf8')) as { windows: SavedWindow[] }).windows).toEqual([saved('debounced')])
    })
  })

  it('stops accepting updates after dispose', async () => {
    const { userData, path } = fixture()
    const store = new WindowSessionStore(userData)
    store.replace([saved('kept')])
    store.dispose()
    store.replace([saved('dropped')])
    await store.flush()
    expect((JSON.parse(readFileSync(path, 'utf8')) as { windows: SavedWindow[] }).windows).toEqual([saved('kept')])
  })

  it('logs a failed write instead of rejecting', async () => {
    const { userData } = fixture()
    rmSync(join(userData, 'desktop'), { recursive: true })
    writeFileSync(join(userData, 'desktop'), 'occupied')
    const store = new WindowSessionStore(userData)
    store.replace([saved('session-1')])
    await expect(store.flush()).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('window-state.json'), expect.any(Error))
  })
})
