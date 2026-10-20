/**
 * Persisted identities and bounds of the secondary conversation windows reopened on startup.
 * Validation and display clamping are pure; {@link WindowSessionStore} owns the userData document.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

/** Document under the Desktop userData `desktop` directory holding the last window set. */
export const WINDOW_SESSION_FILE = 'window-state.json'
/** On-disk document version; any other version is treated as no saved state. */
export const WINDOW_SESSION_VERSION = 1
/** Upper bound on restored secondary conversation windows. */
export const MAX_SAVED_WINDOWS = 8
/** Matches the secondary windows' Electron minimum width. */
export const MIN_WINDOW_WIDTH = 520
/** Matches the secondary windows' Electron minimum height. */
export const MIN_WINDOW_HEIGHT = 600

/** Largest accepted coordinate magnitude; keeps restored rectangles inside Electron's int range. */
const MAX_COORDINATE = 1_000_000
/** Longest accepted conversation identity, matching the openSessionWindow IPC bound. */
const MAX_SESSION_ID = 512

/** Screen or window rectangle in Electron's `Rectangle` field names. */
export interface WindowBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** One secondary conversation window's identity and last bounds. */
export interface SavedWindow {
  readonly sessionId: string
  readonly bounds: WindowBounds
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= MAX_COORDINATE
}

function parseBounds(value: unknown): WindowBounds | undefined {
  if (!record(value)) return undefined
  const { x, y, width, height } = value
  if (!safeInteger(x) || !safeInteger(y) || !safeInteger(width) || !safeInteger(height)) return undefined
  return width <= 0 || height <= 0 ? undefined : { x, y, width, height }
}

/**
 * Validate a conversation identity at the durable-document and IPC boundaries.
 * @param value - untrusted session identity.
 * @returns the identity, or `undefined` when it is empty, overlong, or contains control characters.
 */
export function parseSessionId(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_SESSION_ID) return undefined
  return /[\u0000-\u001f\u007f]/u.test(value) ? undefined : value
}

/**
 * Validate one saved window entry.
 * @param value - untrusted document entry.
 * @returns the entry with valid identity and bounds, otherwise `undefined`.
 */
export function parseSavedWindow(value: unknown): SavedWindow | undefined {
  if (!record(value)) return undefined
  const sessionId = parseSessionId(value.sessionId)
  const bounds = parseBounds(value.bounds)
  return sessionId === undefined || bounds === undefined ? undefined : { sessionId, bounds }
}

/**
 * Project a version-1 window-state document onto restorable windows.
 * Invalid entries are skipped, identities are deduplicated in document order, and the
 * result is capped at {@link MAX_SAVED_WINDOWS}; a wrong version or envelope yields no windows.
 * @param value - parsed JSON document.
 * @returns restorable windows in document order.
 */
export function parseWindowSessionDocument(value: unknown): SavedWindow[] {
  if (!record(value) || value.version !== WINDOW_SESSION_VERSION || !Array.isArray(value.windows)) return []
  const seen = new Set<string>()
  const windows: SavedWindow[] = []
  for (const entry of value.windows) {
    if (windows.length >= MAX_SAVED_WINDOWS) break
    const window = parseSavedWindow(entry)
    if (window === undefined || seen.has(window.sessionId)) continue
    seen.add(window.sessionId)
    windows.push(window)
  }
  return windows
}

function intersectionArea(a: WindowBounds, b: WindowBounds): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 0 && height > 0 ? width * height : 0
}

function squaredDistanceToCenter(a: WindowBounds, b: WindowBounds): number {
  const x = a.x + a.width / 2 - (b.x + b.width / 2)
  const y = a.y + a.height / 2 - (b.y + b.height / 2)
  return x * x + y * y
}

/** Pick the display the saved rectangle most overlaps, or the nearest one when it overlaps none. */
function chooseDisplay(bounds: WindowBounds, displays: readonly WindowBounds[]): WindowBounds | undefined {
  let best: WindowBounds | undefined
  let bestArea = -1
  for (const display of displays) {
    const area = intersectionArea(bounds, display)
    if (area > bestArea) {
      best = display
      bestArea = area
    }
  }
  if (best === undefined || bestArea > 0) return best
  let nearest = best
  let nearestDistance = squaredDistanceToCenter(bounds, best)
  for (const display of displays) {
    const distance = squaredDistanceToCenter(bounds, display)
    if (distance < nearestDistance) {
      nearest = display
      nearestDistance = distance
    }
  }
  return nearest
}

/** Keep a span above the window minimum while never exceeding the chosen display where possible. */
function clampSpan(value: number, minimum: number, available: number): number {
  return Math.min(Math.max(value, minimum), Math.max(available, minimum))
}

/** Keep a position inside the display, or at its origin when the window cannot fit. */
function clampPosition(position: number, origin: number, available: number, span: number): number {
  if (span >= available) return origin
  return Math.min(Math.max(position, origin), origin + available - span)
}

/**
 * Clamp one saved rectangle onto the display it most overlaps.
 * Sizes never drop below {@link MIN_WINDOW_WIDTH}/{@link MIN_WINDOW_HEIGHT}, and positions stay
 * inside the chosen display when the rectangle fits.
 * @param bounds - saved rectangle.
 * @param displays - work areas of the currently connected displays.
 * @returns the clamped rectangle, or `undefined` when no display is available.
 */
export function clampWindowBounds(bounds: WindowBounds, displays: readonly WindowBounds[]): WindowBounds | undefined {
  const display = chooseDisplay(bounds, displays)
  if (display === undefined) return undefined
  const width = clampSpan(bounds.width, MIN_WINDOW_WIDTH, display.width)
  const height = clampSpan(bounds.height, MIN_WINDOW_HEIGHT, display.height)
  return {
    x: clampPosition(bounds.x, display.x, display.width, width),
    y: clampPosition(bounds.y, display.y, display.height, height),
    width,
    height,
  }
}

/** Options for {@link WindowSessionStore}. */
export interface WindowSessionStoreOptions {
  /** Delay before a changed set reaches disk; quitting flushes explicitly. Defaults to 500 ms. */
  readonly debounceMs?: number
}

/**
 * Debounced owner of `<userData>/desktop/window-state.json`.
 * Reads tolerate absent or malformed state and writes replace the document atomically.
 */
export class WindowSessionStore {
  private readonly path: string
  private readonly debounceMs: number
  private windows: SavedWindow[] = []
  private timer: NodeJS.Timeout | undefined
  private pending: Promise<void> = Promise.resolve()
  private disposed = false

  /** @param userData - Electron's userData directory. @param options - debounce override. */
  constructor(userData: string, options: WindowSessionStoreOptions = {}) {
    this.path = join(userData, 'desktop', WINDOW_SESSION_FILE)
    this.debounceMs = options.debounceMs ?? 500
  }

  /**
   * Read the saved set, replacing any in-memory set.
   * An absent document, invalid JSON, or a document with a wrong version yields no windows.
   * @returns restorable windows in document order.
   */
  read(): SavedWindow[] {
    try {
      const value: unknown = JSON.parse(readFileSync(this.path, 'utf8'))
      this.windows = parseWindowSessionDocument(value)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`desktop window state: ${this.path}: ignoring unreadable saved windows`, error)
      }
      this.windows = []
    }
    return this.windows
  }

  /**
   * Replace the in-memory set and schedule one debounced write.
   * @param windows - current secondary conversation windows; later entries beyond the cap are dropped.
   */
  replace(windows: readonly SavedWindow[]): void {
    if (this.disposed) return
    this.windows = windows.slice(0, MAX_SAVED_WINDOWS)
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.flush()
    }, this.debounceMs)
    this.timer.unref()
  }

  /**
   * Write the current set now.
   * @returns a promise that settles after this write attempt; write failures are logged, not thrown.
   */
  flush(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    const document = `${JSON.stringify({ version: WINDOW_SESSION_VERSION, windows: this.windows }, null, 2)}\n`
    this.pending = this.pending
      .then(() => writeFileAtomic(this.path, document, { mode: 0o600, dirMode: 0o700 }))
      .catch((error: unknown) => { console.warn(`desktop window state: ${this.path}: could not be saved`, error) })
    return this.pending
  }

  /** Stop accepting updates and cancel the pending debounce; callers flush before this. */
  dispose(): void {
    this.disposed = true
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }
}
