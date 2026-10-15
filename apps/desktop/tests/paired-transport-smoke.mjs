/** Real private-listener pairing, certificate rejection, and authorized RPC forwarding. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { MobileServer, mobileAddresses } from '../src/mobile-server.ts'
import { pairingOrigin, peerJson } from '../src/peer-transport.ts'
import { parseTailDevices } from '../src/tailscale-discovery.ts'

test('discovery exposes only safe device fields and never grants access', () => {
  const devices = parseTailDevices({ BackendState: 'Running', Self: { ID: 'self', HostName: 'Desktop', TailscaleIPs: ['100.80.1.1'], Online: true, OS: 'windows', Secret: 'never-return' }, Peer: { a: { ID: 'mac', HostName: 'MacBook', TailscaleIPs: ['100.80.1.2'], Online: false, OS: 'macOS' } } })
  assert.equal(devices.length, 2)
  assert.equal(devices[0].self, true)
  assert.equal(devices[1].online, false)
  assert.ok(!JSON.stringify(devices).includes('never-return'))
  assert.throws(() => parseTailDevices({ BackendState: 'NeedsLogin' }))
  for (const value of ['http://100.80.1.1', 'https://example.com', 'https://100.80.1.1@evil.test', 'https://8.8.8.8', 'https://100.80.1.1/path', 'https://100.80.1.1/?token=secret']) assert.throws(() => pairingOrigin(value))
})

test('wrong certificate sends no pairing secret; valid grant reads remote session RPC', { timeout: 30000 }, async () => {
  const address = mobileAddresses()[0]
  assert.ok(address, 'This transport smoke requires one local private network interface')
  await mkdir(resolve('.artifacts'), {recursive:true})
  const root = await mkdtemp(join(resolve('.artifacts'), 'paired-transport-'))
  let approvals = 0, calls = 0
  const host = createServer((req, res) => {
    calls++
    assert.equal(req.headers.cookie, 'HOST_SECRET=fixture')
    assert.equal(req.url, '/api/session/list')
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      assert.equal(JSON.parse(body).method, 'session/list')
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ result: { ok: true, value: { items: [{ sessionId: 'fixture', running: true, projections: { values: { title: 'Remote test' } } }] } } }))
    })
  })
  await new Promise(done => host.listen(0, '127.0.0.1', done))
  let server
  try {
  server = await MobileServer.create({ path: join(root, 'state'), seal: value => Buffer.from(value), unseal: value => value.toString(),
    host: () => ({ url: `http://127.0.0.1:${host.address().port}`, cookie: 'HOST_SECRET=fixture' }), approve: async () => { approvals++; return true } })
    await server.start(address)
    const invitation = JSON.parse(Buffer.from(server.pairingCode().slice(12), 'base64url').toString())
    await assert.rejects(peerJson(invitation.url, '0'.repeat(64), '/_dsh_mobile/pair', { code: invitation.code, label: 'test' }), /证书/)
    assert.equal(approvals, 0)
    const grant = await peerJson(invitation.url, invitation.pin, '/_dsh_mobile/pair', { code: invitation.code, label: 'test' })
    assert.equal(approvals, 1)
    await assert.rejects(peerJson(invitation.url, invitation.pin, '/api/session/list', {}), /拒绝/)
    const result = await peerJson(invitation.url, invitation.pin, '/api/session/list', { type: 'client-request', method: 'session/list', payload: { args: { _request: {} } } }, grant.token)
    assert.equal(result.result.value.items[0].projections.values.title, 'Remote test')
    assert.equal(calls, 1)
    server.revoke(server.devices[0].id)
    await assert.rejects(peerJson(invitation.url, invitation.pin, '/api/session/list', {}, grant.token), /拒绝/)
  } finally {
    await server?.dispose()
    host.closeAllConnections()
    await new Promise(done => host.close(done))
    assert.ok(root.startsWith(resolve('.artifacts') + '\\') || root.startsWith(resolve('.artifacts') + '/'))
    await rm(root, { recursive: true, force: true })
  }
})
