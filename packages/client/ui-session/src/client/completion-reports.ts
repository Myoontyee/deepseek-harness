/** Reports local conversation observations without owning native unread state. */
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { UiSession } from './index.ts'

interface CompletionBridge {
  report(value: { selected: string | null; ready: boolean; sessions: { id: string; running: boolean }[] }): Promise<void>
}

/** @param ui - Session UI observations. @param sessions - Local catalog. @returns Observer teardown. */
export function installCompletionReports(ui: UiSession, sessions: ISessions): () => void {
  const desktop = (globalThis as typeof globalThis & {
    dshDesktop?: { protocolVersion: number; completion?: CompletionBridge }
  }).dshDesktop
  const bridge = desktop?.protocolVersion === 1 ? desktop.completion : undefined
  if (bridge === undefined) return () => {}
  let last = ''
  const report = (): void => {
    const selected = ui.adapter.current.getSnapshot().key
    const payload = {
      selected: typeof selected === 'string' ? selected : null,
      ready: sessions.list.getSnapshot().phase === 'ready',
      sessions: [...ui.sessionStatus.getSnapshot()].flatMap(([id, value]) => value.running === undefined
        ? [] : [{ id: String(id), running: value.running }]),
    }
    const encoded = JSON.stringify(payload)
    if (encoded === last) return
    last = encoded
    void bridge.report(payload).catch((error: unknown) => { console.warn('Native completion report failed:', error) })
  }
  const stopStatus = ui.sessionStatus.subscribe(report)
  const stopCurrent = ui.adapter.current.subscribe(report)
  const stopList = sessions.list.subscribe(report)
  report()
  return () => { stopStatus(); stopCurrent(); stopList() }
}
