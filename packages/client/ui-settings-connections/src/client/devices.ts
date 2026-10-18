/** Native device operations projected into a framework-owned UI snapshot. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

interface Peer { id: string; name: string; address: string; os: string; online: boolean; self: boolean }
interface Paired { id: string; name: string; address: string }
interface Catalog { detect: boolean; peers: Peer[]; paired: Paired[]; warning: string }
interface Conversation { id: string; title: string; running: boolean; workspaceId?: string; archived?: boolean }
interface Workspace { id: string; title: string; path: string }
interface WorkspaceCatalog { sessions: Conversation[]; workspaces: Workspace[]; warning: string }
interface PhoneSummary { id: string; device: string; title: string; updated: number }
interface PhoneTranscript extends PhoneSummary {
  messages: Array<{ role: string; text: string; model: string; thinking: string }>
  annotations: Array<{ quote: string; comment: string }>
}
interface DevicesState {
  catalog: Catalog
  sessions: Record<string, Conversation[]>
  failures: Record<string, string>
  workspaces?: Record<string, Workspace[]>
  warnings?: Record<string, string>
  refreshing?: Record<string, boolean>
  updatedAt?: Record<string, number>
  busy: boolean
  error: string
  phones: PhoneSummary[]
  phone: PhoneTranscript | undefined
}
/** Framework-bound device inventory and explicit user commands. */
export interface DeviceActions {
  hooks: { devices: ObservableSnapshot<DevicesState> }
  deviceCommand: (action: string, args?: Record<string, unknown>) => Promise<boolean>
  watchDevices: () => () => void
  maskPhoneText: (text: string) => string
}
/**
 * Create one plugin-lifetime owner; mounted browser and settings surfaces share one poller.
 * @param invoke - Validated local Desktop IPC operations.
 * @param maskPhoneText - Credential masking supplied by the conversation service.
 * @returns Device commands, observable display state and owner teardown.
 */
export function createDeviceActions(
  invoke: (action: string, args?: Record<string, unknown>) => Promise<unknown>,
  maskPhoneText: (text: string) => string,
): DeviceActions & { dispose(): void } {
  const state = createSnapshotStore<DevicesState>({ catalog: { detect: false, peers: [], paired: [], warning: '' }, sessions: {}, failures: {}, busy: false, error: '', phones: [], phone: undefined })
  let disposed = false
  const isDisposed = (): boolean => disposed
  let loading: Promise<void> | undefined
  let watchers = 0
  let pollGeneration = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const peers = new Map<string, Promise<void>>()
  const refreshPeer = (id: string): Promise<void> => {
    const active = peers.get(id)
    if (active) return active
    state.update((value) => { value.refreshing = { ...value.refreshing, [id]: true } })
    const request = (async () => {
      try {
        const result = await invoke('workspaceCatalog', { id }) as WorkspaceCatalog
        if (isDisposed() || !state.getSnapshot().catalog.paired.some(device => device.id === id)) return
        state.update((value) => {
          value.sessions[id] = result.sessions
          value.workspaces = { ...value.workspaces, [id]: result.workspaces }
          value.warnings = { ...value.warnings, [id]: result.warning }
          value.updatedAt = { ...value.updatedAt, [id]: Date.now() }
          value.failures = Object.fromEntries(Object.entries(value.failures).filter(([key]) => key !== id))
        })
      } catch (error) {
        if (!isDisposed()) state.update((value) => { value.failures[id] = error instanceof Error ? error.message : String(error) })
      } finally {
        peers.delete(id)
        if (!isDisposed()) state.update((value) => { value.refreshing = { ...value.refreshing, [id]: false } })
      }
    })()
    peers.set(id, request)
    return request
  }
  const refresh = (): Promise<void> => loading ??= (async () => {
    const catalog = await invoke('list') as Catalog
    if (isDisposed()) return
    state.update((value) => { value.catalog = catalog })
    const phones = await invoke('phoneConversations') as PhoneSummary[]
    // Bound concurrent peer requests even when many computers are saved.
    for (let offset = 0; offset < catalog.paired.length; offset += 2) {
      await Promise.all(catalog.paired.slice(offset, offset + 2).map(device => refreshPeer(device.id)))
      if (isDisposed()) return
    }
    if (!isDisposed()) state.update((value) => {
      value.phones = phones
      if (value.phone && !phones.some(item => item.id === value.phone?.id)) value.phone = undefined
    })
  })().finally(() => { loading = undefined })
  const deviceCommand: DeviceActions['deviceCommand'] = async (action, args) => {
    if (!isDisposed() && action === 'refresh' && !state.getSnapshot().busy) {
      try { await refresh(); return true }
      catch (error) {
        if (!isDisposed()) state.update((value) => { value.error = error instanceof Error ? error.message : String(error) })
        return false
      }
    }
    if (!isDisposed() && action === 'refreshDevice' && typeof args?.id === 'string') {
      await refreshPeer(args.id)
      return !state.getSnapshot().failures[args.id]
    }
    if (!isDisposed() && action === 'cancelPairTailnet') {
      try { await invoke(action, args); return true }
      catch (error) {
        if (!isDisposed()) state.update((value) => { value.error = error instanceof Error ? error.message : String(error) })
        return false
      }
    }
    if (isDisposed() || state.getSnapshot().busy) return false
    state.update((value) => { value.busy = true; value.error = '' })
    try {
      if (action === 'probeTailnet') await invoke(action, args)
      else if (action === 'readPhoneConversation') {
        const transcript = await invoke(action, args) as PhoneTranscript
        if (!isDisposed()) state.update((value) => { value.phone = transcript })
      } else if (action === 'closePhoneConversation') state.update((value) => { value.phone = undefined })
      else if (action === 'open') await invoke(action, args)
      else { if (action !== 'refresh') await invoke(action, args); await refresh() }
      return true
    }
    catch (error) {
      if (!isDisposed()) state.update((value) => { value.error = error instanceof Error ? error.message : String(error) })
      return false
    }
    finally { if (!isDisposed()) state.update((value) => { value.busy = false }) }
  }
  const tick = async (generation: number): Promise<void> => {
    await deviceCommand('refresh')
    if (watchers > 0 && generation === pollGeneration && !isDisposed()) timer = setTimeout(() => { void tick(generation) }, 15000)
  }
  return { hooks: { devices: state }, deviceCommand, maskPhoneText,
    watchDevices: () => {
      if (++watchers === 1) { clearTimeout(timer); void tick(++pollGeneration) }
      let stopped = false
      return () => { if (stopped) return; stopped = true; if (--watchers === 0) { pollGeneration++; clearTimeout(timer) } }
    },
    dispose: () => { disposed = true; clearTimeout(timer) },
  }
}
