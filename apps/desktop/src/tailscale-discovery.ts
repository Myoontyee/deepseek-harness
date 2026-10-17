/** Read the local Tailscale client inventory without contacting peer devices. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

/** Display-safe Tailscale inventory, with no user identity or authentication keys. */
export interface TailDevice { id: string; name: string; address: string; os: string; online: boolean; self: boolean }
/** Parse only documented display fields from an untrusted CLI response. */
export function parseTailDevices(value: unknown): TailDevice[] {
  if (!value || typeof value !== 'object') throw new Error('Invalid Tailscale status')
  const data = value as Record<string, unknown>
  if (data.BackendState !== 'Running') throw new Error('请先打开 Tailscale 并登录，然后刷新设备')
  const peers = data.Peer && typeof data.Peer === 'object' ? Object.values(data.Peer) : []
  return [data.Self, ...peers].flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    const address = Array.isArray(item.TailscaleIPs) ? item.TailscaleIPs.find(ip => typeof ip === 'string' && /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.(\d{1,3})\.(\d{1,3})$/u.test(ip) && ip.split('.').every(part => Number(part) <= 255)) : undefined
    if (typeof address !== 'string' || typeof item.ID !== 'string') return []
    // DNSName follows the Tailnet machine name; HostName is the OS hostname.
    const machineName = typeof item.DNSName === 'string' ? item.DNSName.trim().split('.')[0] : ''
    const hostName = typeof item.HostName === 'string' ? item.HostName.trim() : ''
    return [{ id: item.ID.slice(0, 200), name: (machineName || hostName || address).slice(0, 200),
      address, os: typeof item.OS === 'string' ? item.OS.slice(0, 40) : '', online: item.Online === true, self: index === 0 }]
  }).slice(0, 512)
}
/** Query the installed local client with bounded output and execution time. */
export async function discoverTailDevices(): Promise<TailDevice[]> {
  const candidates = process.platform === 'win32'
    ? [join(process.env.ProgramFiles ?? 'C:/Program Files', 'Tailscale/tailscale.exe')]
    : ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/usr/bin/tailscale']
  const executable = candidates.find(path => existsSync(path)) ?? 'tailscale'
  const { stdout } = await promisify(execFile)(executable, ['status', '--json'], { windowsHide: true, timeout: 8000, maxBuffer: 2 * 1024 * 1024 })
  return parseTailDevices(JSON.parse(stdout))
}
