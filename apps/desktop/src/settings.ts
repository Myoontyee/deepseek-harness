/**
 * Local Electron shell settings, loaded once per process independently of the Host.
 * Ownership: .agents/notes/implemented/architecture/2026-10-08-desktop-shell-configuration.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

/** What a launch opens: every saved conversation window, or only the primary window. */
export type WindowRestoreOnStartup = 'all' | 'primary'

/** Resolved shell preferences; absent fields use the defaults without rewriting existing files. */
export interface DesktopSettings {
  readonly updates: {
    readonly allowTestAuthPopupWindow: boolean
  }
  readonly windows: {
    readonly restoreOnStartup: WindowRestoreOnStartup
  }
}

/** Default document; first launch writes it so both settings are discoverable. */
const DEFAULTS: DesktopSettings = {
  updates: { allowTestAuthPopupWindow: false },
  windows: { restoreOnStartup: 'primary' },
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function settingsPath(userData: string): string {
  return join(userData, 'desktop', 'settings.json')
}

/** A parsed document plus the fields this module owns; every other field stays available for rewriting. */
interface ParsedSettings {
  readonly document: Record<string, unknown>
  readonly allowTestAuthPopupWindow: boolean | undefined
  readonly restoreOnStartup: WindowRestoreOnStartup | undefined
}

/** Validate every field this module owns and keep the rest of the document for the writer to preserve. */
function parseSettings(raw: string): ParsedSettings {
  const value: unknown = JSON.parse(raw)
  if (!record(value) || (value.updates !== undefined && !record(value.updates))
    || (value.windows !== undefined && !record(value.windows))) {
    throw new Error('expected a JSON object with optional updates and windows objects')
  }
  const allow = value.updates?.allowTestAuthPopupWindow
  if (allow !== undefined && typeof allow !== 'boolean') {
    throw new Error('updates.allowTestAuthPopupWindow must be true or false')
  }
  const restore = value.windows?.restoreOnStartup
  if (restore !== undefined && restore !== 'all' && restore !== 'primary') {
    throw new Error("windows.restoreOnStartup must be 'all' or 'primary'")
  }
  return { document: value, allowTestAuthPopupWindow: allow, restoreOnStartup: restore }
}

/** Read the raw document, or `undefined` when it does not exist. Other read failures propagate. */
function readSettingsFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return undefined
  }
}

/**
 * Read shell settings, creating the default document exclusively when missing.
 * @param userData - Electron's userData directory, independent of DSH_HOME.
 * @returns Validated settings, or defaults when reading, creating or validating fails; changes require a restart.
 */
export function readDesktopSettings(userData: string): DesktopSettings {
  const path = settingsPath(userData)
  try {
    let raw = readSettingsFile(path)
    if (raw === undefined) {
      mkdirSync(join(userData, 'desktop'), { recursive: true, mode: 0o700 })
      try { writeFileSync(path, `${JSON.stringify(DEFAULTS, null, 2)}\n`, { flag: 'wx', mode: 0o600 }) } catch (error) {
        // An existing document belongs to the user, including one created during initialization.
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
      raw = readFileSync(path, 'utf8')
    }
    const parsed = parseSettings(raw)
    return {
      updates: { allowTestAuthPopupWindow: parsed.allowTestAuthPopupWindow ?? false },
      windows: { restoreOnStartup: parsed.restoreOnStartup ?? 'primary' },
    }
  } catch (error) {
    try {
      console.warn(`desktop settings: ${path}: using defaults because settings could not be loaded`, error)
    } catch (_logError) {
      // Diagnostic output is best effort; its failure must not make optional settings fatal.
      // TODO: Persist settings diagnostics when console output is unavailable, without blocking startup.
    }
    return DEFAULTS
  }
}

/**
 * Persist the startup window restore choice, preserving every other document field.
 * A malformed existing document or an invalid value rejects instead of being rewritten;
 * the next launch resolves the new value through {@link readDesktopSettings}.
 * @param userData - Electron's userData directory.
 * @param value - `all` to restore every saved conversation window, `primary` for the primary window only.
 * @returns completion of the atomic replacement.
 */
export async function writeWindowRestoreOnStartup(userData: string, value: unknown): Promise<void> {
  if (value !== 'all' && value !== 'primary') {
    throw new Error("windows.restoreOnStartup must be 'all' or 'primary'")
  }
  const path = settingsPath(userData)
  const raw = readSettingsFile(path)
  const document = raw === undefined ? {} : parseSettings(raw).document
  const windows = document.windows === undefined ? {} : document.windows as Record<string, unknown>
  const next = { ...document, windows: { ...windows, restoreOnStartup: value } }
  await writeFileAtomic(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
}
