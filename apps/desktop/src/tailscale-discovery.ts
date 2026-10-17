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
function tailscaleExecutable(): string {
  const candidates = process.platform === 'win32'
    ? [join(process.env.ProgramFiles ?? 'C:/Program Files', 'Tailscale/tailscale.exe')]
    : ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/usr/bin/tailscale']
  return candidates.find(path => existsSync(path)) ?? 'tailscale'
}
/** Query the installed local client with bounded output and execution time. */
export async function discoverTailDevices(): Promise<TailDevice[]> {
  const { stdout } = await promisify(execFile)(tailscaleExecutable(), ['status', '--json'], { windowsHide: true, timeout: 8000, maxBuffer: 2 * 1024 * 1024 })
  return parseTailDevices(JSON.parse(stdout))
}
/** Verify the connection source against the local Tailscale daemon before presenting approval.
 * @param address - Actual remote socket address, never a forwarded header.
 * @returns The daemon-authenticated node name.
 */
export async function identifyTailnetPeer(address: string): Promise<string> {
  if (!/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/u.test(address) || address.split('.').some(part => Number(part) > 255)) throw new Error('Not a Tailscale source')
  const { stdout } = await promisify(execFile)(tailscaleExecutable(), ['whois', '--json', address], { windowsHide: true, timeout: 8000, maxBuffer: 128 * 1024 })
  const value = JSON.parse(stdout) as { Node?: { Name?: unknown; Addresses?: unknown } }
  const node = value.Node
  if (typeof node?.Name !== 'string' || !Array.isArray(node.Addresses) || !node.Addresses.some(ip => typeof ip === 'string' && ip.split('/')[0] === address)) throw new Error('Unknown Tailscale peer')
  return (node.Name.split('.')[0] ?? '').replace(/[\x00-\x1f\x7f]/gu, '').slice(0, 100)
}
