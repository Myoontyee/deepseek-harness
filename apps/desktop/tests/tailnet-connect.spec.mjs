/** The Desktop initiator sends real HTTP requests before receiving a pinned device grant. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createTailnetPairingHandler } from '../src/tailnet-pairing.ts'
import { exchangeBootstrap, probeTailnetConnection, requestTailnetConnection } from '../src/tailnet-connect.ts'
import { deviceApprovalCopy } from '../src/device-approval-copy.ts'

const address = '100.80.1.2'
const connection = { url: `https://${address}:4444`, pin: 'a'.repeat(64), token: 'b'.repeat(43) }
async function fixture(options) {
  let handler
  const server = createServer((req, res) => handler(req, res))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const authority = `127.0.0.1:${server.address().port}`
  handler = createTailnetPairingHandler(authority, options)
  return {
    exchange: (selected, method, signal) => {
      assert.equal(selected, `${address}:42873`)
      return exchangeBootstrap(authority, method, signal)
    },
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) },
  }
}
test('a probe never asks for approval; the subsequent request verifies the source and obtains approval once', async () => {
  let verified = 0, approved = 0
  const app = await fixture({
    verify: async source => { assert.equal(source, '127.0.0.1'); verified++; return '3070-laptop' },
    authorize: async (name, signal) => {
      assert.equal(name, '3070-laptop'); assert.equal(signal.aborted, false); approved++; return connection
    },
  })
  try {
    await probeTailnetConnection(address, app.exchange)
    assert.equal(verified, 0); assert.equal(approved, 0)
    assert.deepEqual(await requestTailnetConnection(address, new AbortController().signal, app.exchange), connection)
    assert.equal(verified, 1); assert.equal(approved, 1)
  } finally { await app.close() }
})
test('identity failure and explicit rejection produce different actionable errors', async () => {
  for (const rejectIdentity of [true, false]) {
    let approved = false
    const app = await fixture({
      verify: async () => { if (rejectIdentity) throw new Error('Unknown source'); return '3070-laptop' },
      authorize: async () => { approved = true; throw new Error('Rejected') },
    })
    try {
      await assert.rejects(requestTailnetConnection(address, new AbortController().signal, app.exchange),
        rejectIdentity ? /Tailscale 身份/u : /访问批准/u)
      assert.equal(approved, !rejectIdentity)
    } finally { await app.close() }
  }
})
test('cancelling a waiting operator request releases the receiver approval slot', async () => {
  let entered, released
  const began = new Promise(resolve => { entered = resolve })
  const cancelled = new Promise(resolve => { released = resolve })
  let calls = 0
  const app = await fixture({ verify: async () => '3070-laptop', authorize: async (_name, signal) => {
    if (++calls > 1) return connection
    signal.addEventListener('abort', released, { once: true }); entered()
    return new Promise(() => {})
  } })
  try {
    const controller = new AbortController()
    const first = requestTailnetConnection(address, controller.signal, app.exchange)
    const failed = assert.rejects(first, /已取消/u)
    await began
    await assert.rejects(requestTailnetConnection(address, new AbortController().signal, app.exchange), /等待确认/u)
    controller.abort(); await failed; await cancelled
    assert.deepEqual(await requestTailnetConnection(address, new AbortController().signal, app.exchange), connection)
  } finally { await app.close() }
})
test('rejects non-Tailnet addresses, incompatible services and mismatched grant origins', async () => {
  const unexpected = async () => { throw new Error('Must not connect') }
  for (const ip of ['127.0.0.1', '192.168.1.1', '100.128.1.1', 'example.test', '100.80.1.999']) {
    await assert.rejects(probeTailnetConnection(ip, unexpected), /请选择/u)
  }
  await assert.rejects(probeTailnetConnection(address, async () => ({ status: 200, body: { service: 'other', protocol: 1 } })), /兼容/u)
  await assert.rejects(requestTailnetConnection(address, new AbortController().signal,
    async () => ({ status: 200, body: { ...connection, url: 'https://100.80.1.3:4444' } })), /不一致/u)
})
test('native approval names computers as devices and explains retained authorization', () => {
  assert.match(deviceApprovalCopy('zh-CN').message('3070-laptop'), /3070-laptop/u)
  assert.match(deviceApprovalCopy('zh-CN').detail, /首次批准后会保存/u)
  assert.equal(deviceApprovalCopy('en-US').title, 'Device connection request')
})
