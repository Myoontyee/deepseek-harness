import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import { readDesktopSettings, writeWindowRestoreOnStartup } from '../src/settings.ts'

vi.mock('node:fs', async importOriginal => ({ ...await importOriginal<typeof import('node:fs')>() }))

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

function fixture() {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-desktop-settings-'))
  onTestFinished(() => { rmSync(userData, { recursive: true, force: true }) })
  const directory = join(userData, 'desktop')
  mkdirSync(directory)
  return { userData, path: join(directory, 'settings.json') }
}

it('creates a discoverable default file on first launch without touching other preferences', () => {
  const { userData, path } = fixture()
  rmSync(join(userData, 'desktop'), { recursive: true })
  writeFileSync(join(userData, 'keybindings.json'), 'existing shortcuts\n')
  expect(readDesktopSettings(userData)).toEqual({
    updates: { allowTestAuthPopupWindow: false },
    windows: { restoreOnStartup: 'primary' },
  })
  expect(readFileSync(path, 'utf8')).toBe('{\n  "updates": {\n    "allowTestAuthPopupWindow": false\n  },\n  "windows": {\n    "restoreOnStartup": "primary"\n  }\n}\n')
  expect(readFileSync(join(userData, 'keybindings.json'), 'utf8')).toBe('existing shortcuts\n')
})

it.each(['{}', '{"updates": {}}', '{"other": 1, "updates": {"other": true}}'])('defaults an older document without rewriting it: %s', (raw) => {
  const { userData, path } = fixture()
  writeFileSync(path, raw)
  expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(false)
  expect(readDesktopSettings(userData).windows.restoreOnStartup).toBe('primary')
  expect(readFileSync(path, 'utf8')).toBe(raw)
})

it('loads explicit opt-in and opt-out on the next read without changing an earlier process snapshot', () => {
  const { userData, path } = fixture()
  for (const allow of [true, false]) {
    const raw = JSON.stringify({ updates: { allowTestAuthPopupWindow: allow }, custom: 'preserve' })
    writeFileSync(path, raw)
    expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(allow)
    expect(readFileSync(path, 'utf8')).toBe(raw)
  }
  const previous = readDesktopSettings(userData)
  writeFileSync(path, '{"updates":{"allowTestAuthPopupWindow":true},"windows":{"restoreOnStartup":"all"}}')
  expect(previous.updates.allowTestAuthPopupWindow).toBe(false)
  expect(previous.windows.restoreOnStartup).toBe('primary')
  expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(true)
  expect(readDesktopSettings(userData).windows.restoreOnStartup).toBe('all')
})

it.each(['', '{', 'null', '[]', '{"updates":null}', '{"updates":[]}',
  '{"updates":{"allowTestAuthPopupWindow":"false"}}', '{"updates":{"allowTestAuthPopupWindow":1}}',
  '{"updates":{"allowTestAuthPopupWindow":null}}', '{"windows":null}', '{"windows":[]}',
  '{"windows":{"restoreOnStartup":"some"}}', '{"windows":{"restoreOnStartup":1}}',
  '{"windows":{"restoreOnStartup":null}}'])('reports invalid settings with their path and preserves the original: %s', (raw) => {
  const { userData, path } = fixture()
  writeFileSync(path, raw)
  const settings = readDesktopSettings(userData)
  expect(settings.updates.allowTestAuthPopupWindow).toBe(false)
  expect(settings.windows.restoreOnStartup).toBe('primary')
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(path), expect.any(Error))
  expect(readFileSync(path, 'utf8')).toBe(raw)
})

it('reports filesystem errors instead of replacing unreadable settings', () => {
  const { userData, path } = fixture()
  mkdirSync(path)
  expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(false)
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(path), expect.any(Error))
  expect(fs.statSync(path).isDirectory()).toBe(true)
})

it.each(['mkdirSync', 'writeFileSync'] as const)('continues with disabled popups when %s fails', (operation) => {
  const { userData, path } = fixture()
  const failure = Object.assign(new Error('settings creation denied'), { code: 'EACCES' })
  vi.spyOn(fs, operation).mockImplementation(() => { throw failure })
  expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(false)
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(path), failure)
})

it('continues with defaults even when warning output fails', () => {
  const { userData, path } = fixture()
  writeFileSync(path, '{')
  vi.mocked(console.warn).mockImplementation(() => { throw new Error('output unavailable') })
  expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(false)
  expect(readFileSync(path, 'utf8')).toBe('{')
})

it('creates the settings document when persisting the startup window choice', async () => {
  const { userData, path } = fixture()
  rmSync(join(userData, 'desktop'), { recursive: true })
  await writeWindowRestoreOnStartup(userData, 'all')
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ windows: { restoreOnStartup: 'all' } })
  expect(readDesktopSettings(userData).windows.restoreOnStartup).toBe('all')
  expect(console.warn).not.toHaveBeenCalled()
})

it('updates only windows.restoreOnStartup and preserves every other field', async () => {
  const { userData, path } = fixture()
  const raw = JSON.stringify({ updates: { allowTestAuthPopupWindow: true }, custom: { keep: [1, 2] }, windows: { other: 'kept' } })
  writeFileSync(path, raw)
  await writeWindowRestoreOnStartup(userData, 'all')
  const written = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  expect(written).toEqual({
    updates: { allowTestAuthPopupWindow: true },
    custom: { keep: [1, 2] },
    windows: { other: 'kept', restoreOnStartup: 'all' },
  })
  expect(readDesktopSettings(userData).windows.restoreOnStartup).toBe('all')
  expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(true)
})

it.each(['all ', 'ALL', '', null, true, ['all']])('rejects an invalid startup window choice without rewriting the document: %s', async (value) => {
  const { userData, path } = fixture()
  writeFileSync(path, '{"updates":{"allowTestAuthPopupWindow":true}}\n')
  await expect(writeWindowRestoreOnStartup(userData, value)).rejects.toThrow("windows.restoreOnStartup must be 'all' or 'primary'")
  expect(readFileSync(path, 'utf8')).toBe('{"updates":{"allowTestAuthPopupWindow":true}}\n')
})

it('rejects a malformed existing document instead of rewriting it', async () => {
  const { userData, path } = fixture()
  for (const raw of ['{', '[]', '{"windows":{"restoreOnStartup":"some"}}', '{"updates":{"allowTestAuthPopupWindow":"yes"}}']) {
    writeFileSync(path, raw)
    await expect(writeWindowRestoreOnStartup(userData, 'all')).rejects.toThrow()
    expect(readFileSync(path, 'utf8')).toBe(raw)
  }
})
