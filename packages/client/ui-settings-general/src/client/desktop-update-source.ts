/** Client-owned observation of the optional Desktop preload. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { DesktopUpdateBridge, DesktopUpdateView, UpdateIndicatorColors } from '../types.ts'

/** Owns one preload subscription across both sidebar locations. */
export class DesktopUpdateSource {
  /** Framework-observed carrier status shared by both sidebar controls. */
  readonly store = createSnapshotStore<DesktopUpdateView>({ failed: false, opening: false })
  private readonly colorKey = 'dsh-update-indicator-colors'
  private readonly syncColors = (): void => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(this.colorKey) ?? 'null')
      if (typeof parsed !== 'object' || parsed === null || !('custom' in parsed) || !('official' in parsed)) return
      const allowed = new Set(['blue', 'green', 'orange', 'purple'])
      if (typeof parsed.custom !== 'string' || typeof parsed.official !== 'string' || !allowed.has(parsed.custom) || !allowed.has(parsed.official)) return
      this.store.set({ ...this.store.getSnapshot(), colors: parsed as UpdateIndicatorColors })
    } catch (_error) { /* Unavailable browser storage keeps the default colors. */ }
  }
  private live = true
  private received = false
  private readonly unsubscribe: (() => void) | undefined

  /** @param bridge - Optional isolated Electron API, absent in ordinary browsers. */
  constructor(private readonly bridge: DesktopUpdateBridge | undefined) {
    this.syncColors()
    window.addEventListener('storage', this.syncColors)
    this.unsubscribe = bridge?.subscribe((presentation) => {
      if (!this.live) return
      this.received = true
      this.store.set({ ...this.store.getSnapshot(), presentation, failed: false })
    })
    void bridge?.status().then((presentation) => {
      if (this.live && !this.received) this.store.set({ ...this.store.getSnapshot(), presentation })
    }, () => {
      if (this.live && !this.received) this.store.set({ ...this.store.getSnapshot(), failed: true })
    })
  }

  /**
   * Save presentation preferences without changing update trust or scheduling.
   * @param colors - User-selected indicator colors.
   */
  setColors(colors: UpdateIndicatorColors): void {
    this.store.set({ ...this.store.getSnapshot(), colors })
    try { localStorage.setItem(this.colorKey, JSON.stringify(colors)) } catch (_error) {
      /* Session-local preferences remain usable without storage. */
    }
  }

  /**
   * Invoke one user action; subsequent clicks join the shell-owned operation.
   * @param channel - Independent update channel selected by the user.
   */
  open(channel: 'custom' | 'official' = 'custom'): void {
    if (!this.live || this.bridge === undefined) return
    const state = this.store.getSnapshot()
    if (state.opening || (channel === 'custom' && state.presentation !== undefined
      && ['checking', 'downloading', 'verifying', 'installing'].includes(state.presentation.phase))) return
    this.store.set({ ...state, opening: true })
    void this.bridge.open(channel).catch(() => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), failed: true })
    }).finally(() => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), opening: false })
    })
  }

  /** Detach the carrier and ignore any pending status or action completion. */
  dispose(): void { this.live = false; window.removeEventListener('storage', this.syncColors); this.unsubscribe?.() }
}
