/** Certificate-pinned JSON transport for explicitly paired computers. */
import { request } from 'node:https'
import { X509Certificate } from 'node:crypto'
import { isIP } from 'node:net'
import type { TLSSocket } from 'node:tls'

/** Only private IPv4 origins are accepted; DNS cannot redirect a pairing invitation. */
export function pairingOrigin(value: string): string {
  const url = new URL(value)
  const host = url.hostname
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || isIP(host) !== 4 || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/u.test(host)) throw new Error('只支持电脑生成的私有网络 HTTPS 配对地址')
  return url.origin
}
/** Validate certificate identity and lifetime before sending any invitation or device token. */
export function acceptsPeerCertificate(raw: Buffer, pin: string): boolean {
  const cert = new X509Certificate(raw)
  return cert.fingerprint256.replaceAll(':', '').toLowerCase() === pin
    && Date.parse(cert.validFrom) <= Date.now() && Date.parse(cert.validTo) >= Date.now()
}
/** Pinned, bounded JSON exchange; request bytes are withheld until the peer certificate is verified. */
export function peerJson(url: string, pin: string, path: string, body: unknown, token?: string): Promise<unknown> {
  const origin = pairingOrigin(url)
  if (!/^[a-f0-9]{64}$/u.test(pin) || (token !== undefined && !/^[\w-]{43}$/u.test(token))) return Promise.reject(new Error('Invalid pairing credential'))
  return new Promise((resolve, reject) => {
    const bytes = Buffer.from(JSON.stringify(body))
    const req = request(origin + path, { method: 'POST', rejectUnauthorized: false, agent: false,
      headers: { 'content-type': 'application/json', 'content-length': bytes.length, ...(token ? { cookie: `__Host-dsh-device=${token}` } : {}) } }, (res) => {
      let size = 0
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 8 * 1024 * 1024) req.destroy(new Error('远端响应过大')); else chunks.push(chunk) })
      res.on('error', reject)
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error(`远端拒绝请求（${String(res.statusCode)}），请检查配对授权`)); return }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new Error('远端返回了无效数据')) }
      })
    })
    const timer = setTimeout(() => { req.destroy(new Error('连接超时，请确认设备在线且 Tailscale 已连接')) }, 25000)
    req.once('close', () => { clearTimeout(timer) })
    req.once('error', reject)
    req.once('socket', (socket) => {
      const tls = socket as TLSSocket
      tls.once('secureConnect', () => {
        try {
          const cert = tls.getPeerCertificate()
          if (!cert.raw || !acceptsPeerCertificate(cert.raw, pin)) throw new Error('设备证书已改变或过期，请重新配对')
          req.end(bytes)
        } catch (error) { req.destroy(error instanceof Error ? error : new Error('Certificate validation failed')) }
      })
    })
  })
}
