/** Approval bootstrap over a daemon-selected Tailnet address, independent of system HTTP proxies. */
import { request } from 'node:http'
import { isIP } from 'node:net'
import { pairingOrigin } from './peer-transport.ts'
import type { TailnetConnection } from './tailnet-pairing.ts'

interface Reply { status: number; body: unknown }
/** Transport injection keeps loopback fixtures separate from production address selection. */
export type BootstrapExchange = (address: string, method: 'GET' | 'POST', signal?: AbortSignal) => Promise<Reply>

/** Exchange bounded JSON with a Tailnet bootstrap listener without redirects or ambient proxies.
 * @param address - Selected numeric host and protocol port.
 * @param method - Readiness probe or explicit approval request.
 * @param signal - Cancels an abandoned approval request.
 * @returns HTTP status and parsed response, never logged by this transport.
 */
export const exchangeBootstrap: BootstrapExchange = (address, method, signal) => new Promise((resolve, reject) => {
  const req = request(`http://${address}/v1/${method === 'GET' ? 'status' : 'pair'}`, {
    method, agent: false, signal,
    headers: method === 'POST' ? { 'content-type': 'application/json', 'content-length': 2 } : {},
  }, (res) => {
    const chunks: Buffer[] = []; let size = 0
    res.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 65536) req.destroy(new Error('对方返回的连接信息过大'))
      else chunks.push(chunk)
    })
    res.once('error', reject)
    res.once('end', () => {
      try {
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve({ status: res.statusCode ?? 0, body })
      } catch (error) { reject(new Error('对方未返回有效的 DSH 连接信息，请检查版本', { cause: error })) }
    })
  })
  const timer = setTimeout(() => { req.destroy(new Error(method === 'GET'
    ? '无法联系对方 DSH 连接服务，请确认对方软件正在运行并允许设备连接'
    : '等待对方确认超时，请在对方电脑检查授权弹窗后重试')) }, method === 'GET' ? 6000 : 65000)
  req.once('close', () => { clearTimeout(timer) })
  req.once('error', (error) => {
    reject(signal?.aborted ? new Error('已取消连接申请')
      : new Error(`无法完成 DSH 设备连接：${error.message}`, { cause: error }))
  })
  req.end(method === 'POST' ? '{}' : undefined)
})

function authority(address: string): string {
  if (isIP(address) !== 4 || !/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./u.test(address)) throw new Error('请选择当前 Tailscale 列表中的电脑')
  return `${address}:42873`
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('对方 DSH 连接信息格式无效')
  return value as Record<string, unknown>
}
/** Probe the selected peer before the UI asks the user to watch its approval dialog.
 * @param address - Daemon-selected numeric Tailnet address.
 * @param exchange - Bounded HTTP transport.
 * @returns Completion only when the peer advertises this bootstrap protocol.
 */
export async function probeTailnetConnection(address: string, exchange = exchangeBootstrap): Promise<void> {
  const reply = await exchange(authority(address), 'GET')
  const body = object(reply.body)
  if (reply.status !== 200 || body.service !== 'deepseek-harness-desktop' || body.protocol !== 1) {
    throw new Error('对方未提供兼容的 DSH 设备连接服务，请更新对方客户端或启用设备连接')
  }
}
/** Request explicit approval and validate returned identity before persisting any grant.
 * @param address - Fresh daemon-selected numeric Tailnet address.
 * @param signal - Cancels the request and releases the receiving computer's approval slot.
 * @param exchange - Bounded HTTP transport.
 * @returns Pinned HTTPS origin and device token for the selected computer only.
 */
export async function requestTailnetConnection(
  address: string, signal: AbortSignal, exchange = exchangeBootstrap,
): Promise<TailnetConnection> {
  const reply = await exchange(authority(address), 'POST', signal)
  const body = object(reply.body)
  if (reply.status !== 200) {
    const messages: Record<string, string> = {
      approval_busy: '对方已有一条连接申请等待确认，请先处理该弹窗',
      rate_limited: '连接申请过于频繁，请稍后重试',
      approval_timeout: '对方尚未确认，申请已超时；请在对方电脑重试',
      identity_rejected: '对方无法核验此电脑的 Tailscale 身份，请检查双方登录状态',
      approval_rejected: '未获得对方访问批准，请查看对方确认窗；旧版也可能在身份核验失败时返回此结果',
    }
    throw new Error(typeof body.code === 'string' && messages[body.code] ? messages[body.code] : `对方拒绝连接申请（${reply.status}）`)
  }
  if (typeof body.url !== 'string' || typeof body.pin !== 'string' || typeof body.token !== 'string') throw new Error('对方未返回完整设备授权')
  const url = pairingOrigin(body.url)
  if (new URL(url).hostname !== address || !/^[a-f0-9]{64}$/u.test(body.pin) || !/^[\w-]{43}$/u.test(body.token)) {
    throw new Error('对方返回的设备身份与所选电脑不一致，已拒绝保存')
  }
  return { url, pin: body.pin, token: body.token }
}
