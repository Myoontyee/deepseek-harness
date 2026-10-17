/** Machine names follow Tailnet renames rather than the underlying OS hostname. */
import { expect, it } from 'vitest'
import { parseTailDevices } from '../src/tailscale-discovery.ts'

it.each([
  ['4090-server.tail-example.ts.net.', 'DESKTOP-5OFIN53', '4090-server'],
  ['vivo-s18pro.tail-example.ts.net.', 'V2344A', 'vivo-s18pro'],
  ['', 'MacBook Air', 'MacBook Air'],
  [undefined, '  Desktop  ', 'Desktop'],
  ['.', '', '100.80.1.1'],
])('uses the Tailnet name %s with hostname fallback', (DNSName, HostName, expected) => {
  const [device] = parseTailDevices({ BackendState: 'Running', Self: {
    ID: 'self', DNSName, HostName, TailscaleIPs: ['100.80.1.1'], Online: true, OS: 'windows',
  } })
  expect(device?.name).toBe(expected)
  expect(device?.self).toBe(true)
})

it('limits display names and omits account and authentication data', () => {
  const devices = parseTailDevices({ BackendState: 'Running', Peer: { fixture: {
    ID: 'peer', DNSName: 'a'.repeat(250) + '.tail-example.ts.net.', HostName: 'old-host',
    TailscaleIPs: ['100.80.1.2'], UserID: 'private-user', Key: 'private-key',
  } } })
  expect(devices[0]?.name).toHaveLength(200)
  expect(devices[0]?.self).toBe(false)
  expect(JSON.stringify(devices)).not.toContain('private-')
})
