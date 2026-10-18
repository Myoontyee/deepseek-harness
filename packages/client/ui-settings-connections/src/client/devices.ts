/** Native device operations projected into a framework-owned UI snapshot. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

interface Peer { id: string; name: string; address: string; os: string; online: boolean; self: boolean }
interface Paired { id: string; name: string; address: string }
interface Catalog { detect: boolean; peers: Peer[]; paired: Paired[]; warning: string }
interface Conversation { id: string; title: string; running: boolean }
interface PhoneSummary { id: string; device: string; title: string; updated: number }
interface PhoneTranscript extends PhoneSummary {
  messages: Array<{ role: string; text: string; model: string; thinking: string }>
  annotations: Array<{ quote: string; comment: string }>
}
interface DevicesState {
  catalog: Catalog
  sessions: Record<string, Conversation[]>
  failures: Record<string, string>
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
 * Create one plugin-lifetime owner; polling runs only while the device panel is mounted.
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
  let loading: Promise<void> | undefined
  const refresh = (): Promise<void> => loading ??= (async () => {
    const catalog = await invoke('list') as Catalog
    if (disposed) return
    const phones = await invoke('phoneConversations') as PhoneSummary[]
    const sessions: Record<string, Conversation[]> = {}
    const failures: Record<string, string> = {}
    // Bound concurrent peer requests even when many computers are saved.
    for (let offset = 0; offset < catalog.paired.length; offset += 4) {
      await Promise.all(catalog.paired.slice(offset, offset + 4).map(async (device) => {
        try { sessions[device.id] = await invoke('conversations', { id: device.id }) as Conversation[] }
        catch (error) { failures[device.id] = error instanceof Error ? error.message : String(error) }
      }))
      if (disposed) return
    }
    if (!disposed) state.update((value) => {
      value.catalog = catalog; value.sessions = sessions; value.failures = failures; value.phones = phones
      if (value.phone && !phones.some(item => item.id === value.phone?.id)) value.phone = undefined
    })
  })().finally(() => { loading = undefined })
  const deviceCommand: DeviceActions['deviceCommand'] = async (action, args) => {
    if (disposed || state.getSnapshot().busy) return false
    state.update((value) => { value.busy = true; value.error = '' })
    try {
      if (action === 'readPhoneConversation') {
        const transcript = await invoke(action, args) as PhoneTranscript
        if (!disposed) state.update((value) => { value.phone = transcript })
      } else if (action === 'closePhoneConversation') state.update((value) => { value.phone = undefined })
      else { if (action !== 'refresh') await invoke(action, args); await refresh() }
      return true
    }
    catch (error) {
      if (!disposed) state.update((value) => { value.error = error instanceof Error ? error.message : String(error) })
      return false
    }
    finally { if (!disposed) state.update((value) => { value.busy = false }) }
  }
  return { hooks: { devices: state }, deviceCommand, maskPhoneText,
    watchDevices: () => {
      let active = true
      let timer: ReturnType<typeof setTimeout> | undefined
      const tick = async (): Promise<void> => {
        await deviceCommand('refresh')
        if (active && !disposed) timer = setTimeout(() => { void tick() }, 15000)
      }
      void tick()
      return () => { active = false; clearTimeout(timer) }
    },
    dispose: () => { disposed = true },
  }
}
