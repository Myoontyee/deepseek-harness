import 'reflect-metadata'
import WebSocket, { WebSocketServer } from 'ws'
/** Opt-in HTTPS gateway. The DSH Host and its authentication cookie remain loopback-only. */
import { createServer, type Server } from 'node:https'
import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'node:http'
import type { Duplex } from 'node:stream'
import { request as httpRequest } from 'node:http'
import { randomBytes, randomUUID, createHash, timingSafeEqual, X509Certificate } from 'node:crypto'
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { networkInterfaces } from 'node:os'
import {
  X509CertificateGenerator,
  BasicConstraintsExtension,
  KeyUsagesExtension,
  KeyUsageFlags,
  ExtendedKeyUsageExtension,
  PemConverter,
} from '@peculiar/x509'

const COOKIE = '__Host-dsh-device'
const MAX_BODY = 64 * 1024 * 1024
const digest = (value: string): string => createHash('sha256').update(value).digest('hex')
const random = () => randomBytes(32).toString('base64url')
const equal = (a: string, b: string): boolean =>
  typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const privateAddress = (address: string): boolean =>
  /^(10\.|192\.168\.|127\.)/.test(address) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address)

/** Return concrete local private IPv4 addresses suitable for an explicit listener. */
export function mobileAddresses(): string[] {
  return [
    ...new Set(
      Object.values(networkInterfaces())
        .flatMap(items => items ?? [])
        .filter(item => item.family === 'IPv4' && !item.internal && privateAddress(item.address))
        .map(item => item.address),
    ),
  ]
}
async function identity(): Promise<{ key: string; cert: string }> {
  const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048 }
  const keys = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])
  if (!('privateKey' in keys)) throw new Error('Certificate key pair unavailable')
  const cert = await X509CertificateGenerator.createSelfSigned(
    {
      serialNumber: '01' + randomBytes(16).toString('hex'),
      name: 'CN=DSH paired computer',
      notBefore: new Date(Date.now() - 60000),
      notAfter: new Date(Date.now() + 3650 * 86400000),
      signingAlgorithm: algorithm,
      keys,
      extensions: [
        new BasicConstraintsExtension(false),
        new KeyUsagesExtension(KeyUsageFlags.digitalSignature | KeyUsageFlags.keyEncipherment),
        new ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.1']),
      ],
    },
    crypto,
  )
  return {
    key: PemConverter.encode(await crypto.subtle.exportKey('pkcs8', keys.privateKey), 'PRIVATE KEY'),
    cert: cert.toString('pem'),
  }
}
interface DeviceGrant {
  id: string
  label: string
  hash: string
  createdAt: string
}
interface StoredState {
  version: number
  enabled: boolean
  address: string
  port: number
  devices: DeviceGrant[]
  key: string
  cert: string
}
/** Desktop-owned gateway dependencies. Secret storage must use OS-backed encryption. */
export interface MobileServerOptions {
  path: string
  seal(value: string): Buffer
  unseal(value: Buffer): string
  host(): { url: string; cookie: string } | undefined
  approve(label: string): Promise<boolean>
}
/** Device-scoped HTTPS gateway with short-lived pairing and active-stream revocation. */
export class MobileServer {
  private server: Server | undefined
  private code: { secret: string; expires: number } | undefined
  private readonly active = new Map<string, Set<() => void>>()
  private readonly sockets = new Set<Duplex>()
  private pairAttempts: number[] = []
  private pairing = false
  private webSockets: WebSocketServer | undefined
  /** Public SHA-256 fingerprint carried by the physically transferred pairing code. */
  readonly pin: string
  /** Load encrypted grants, or create an initially disabled gateway identity. */
  static async create(options: MobileServerOptions): Promise<MobileServer> {
    let state: StoredState
    try {
      state = JSON.parse(options.unseal(readFileSync(options.path))) as StoredState
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
      state = { version: 1, enabled: false, address: '', port: 0, devices: [], ...(await identity()) }
    }
    if (state.version !== 1 || !Array.isArray(state.devices) || state.devices.length > 8)
      throw new Error('Invalid mobile-control storage')
    const instance = new MobileServer(options, state)
    instance.save()
    return instance
  }
  private constructor(
    private readonly options: MobileServerOptions,
    private readonly state: StoredState,
  ) {
    this.pin = new X509Certificate(state.cert).fingerprint256.replaceAll(':', '').toLowerCase()
  }
  private save(): void {
    mkdirSync(dirname(this.options.path), { recursive: true })
    const temp = this.options.path + '.tmp'
    writeFileSync(temp, this.options.seal(JSON.stringify(this.state)), { mode: 0o600 })
    renameSync(temp, this.options.path)
  }
  /** Whether the opt-in listener is accepting connections. */
  get enabled(): boolean {
    return Boolean(this.server?.listening)
  }
  /** Active private-network HTTPS origin; absent while disabled. */
  get origin(): string | undefined {
    return this.enabled ? `https://${this.state.address}:${this.state.port}` : undefined
  }
  /** User-visible device metadata without authorization hashes. */
  get devices(): Array<Pick<DeviceGrant, 'id' | 'label' | 'createdAt'>> {
    return this.state.devices.map(({ id, label, createdAt }) => ({ id, label, createdAt }))
  }
  /** Restore the explicitly enabled listener after a Host restart. */
  async restore(): Promise<void> {
    if (this.state.enabled) await this.start(this.state.address)
  }
  /** Bind a selected local private address, retaining the previously allocated port. */
  async start(address: string): Promise<void> {
    if (this.enabled) return
    if (!privateAddress(address) || (!mobileAddresses().includes(address) && address !== '127.0.0.1'))
      throw new Error('Choose a current private-network address')
    const server = createServer({ key: this.state.key, cert: this.state.cert, minVersion: 'TLSv1.2' }, (req, res) => {
      void this.handle(req, res).catch(() => {
        if (!res.headersSent) this.reply(res, 502, { error: 'Computer request failed' })
        else res.destroy()
      })
    })
    server.headersTimeout = 15000
    server.requestTimeout = 120000
    server.keepAliveTimeout = 5000
    server.on('connection', (socket) => {
      this.sockets.add(socket)
      socket.once('close', () => this.sockets.delete(socket))
    })
    this.webSockets = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY })
    server.on('upgrade', (request, socket, head) => {
      this.upgrade(request, socket, head)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen({ host: address, port: this.state.port }, () => {
          server.off('error', reject)
          resolve()
        })
      })
    } catch (error) {
      server.close()
      throw error
    }
    this.server = server
    this.state.address = address
    const bound = server.address()
    if (!bound || typeof bound === 'string') throw new Error('Mobile listener did not bind')
    this.state.port = bound.port
    this.state.enabled = true
    try {
      this.save()
    } catch (error) {
      await this.stop()
      throw error
    }
  }
  /** Disable future access and terminate every active device stream. */
  async stop(): Promise<void> {
    this.code = undefined
    this.state.enabled = false
    this.save()
    for (const active of this.active.values()) for (const close of active) close()
    this.active.clear()
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    this.webSockets?.close()
    this.webSockets = undefined
    const server = this.server
    this.server = undefined
    if (server)
      await new Promise<void>(resolve =>
        server.close(() => {
          resolve()
        }),
      )
  }
  /** Close this process while preserving the next-launch enable preference. */
  async dispose(): Promise<void> {
    const resume = this.state.enabled
    await this.stop()
    this.state.enabled = resume
    this.save()
  }
  /** Create a new random, single-use pairing invitation valid for five minutes. */
  pairingCode(): string {
    if (!this.enabled) throw new Error('Enable mobile control first')
    if (this.state.devices.length >= 8) throw new Error('Remove a paired device before adding another')
    this.code = { secret: random(), expires: Date.now() + 5 * 60000 }
    return (
      'dsh-pair-v1:' +
      Buffer.from(JSON.stringify({ url: this.origin, pin: this.pin, code: this.code.secret })).toString('base64url')
    )
  }
  /** Remove a stored device grant and terminate all of its active streams. */
  revoke(id: string): void {
    this.state.devices = this.state.devices.filter(device => device.id !== id)
    this.save()
    for (const close of this.active.get(id) ?? []) close()
    this.active.delete(id)
  }
  private reply(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    res.end(JSON.stringify(body))
  }
  private device(req: IncomingMessage): DeviceGrant | undefined {
    const value = req.headers.cookie
      ?.split(';')
      .map(s => s.trim())
      .find(s => s.startsWith(COOKIE + '='))
      ?.slice(COOKIE.length + 1)
    if (!value || !/^[\w-]{43}$/.test(value)) return
    const hash = digest(value)
    return this.state.devices.find(item => equal(item.hash, hash))
  }
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = this.origin
    if (!origin) {
      this.reply(res, 503, { error: 'Mobile control disabled' })
      return
    }
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) {
      this.reply(res, 403, { error: 'Untrusted origin' })
      return
    }
    const path = req.url ?? '/'
    if (!path.startsWith('/') || path.startsWith('//')) {
      this.reply(res, 400, { error: 'Invalid path' })
      return
    }
    const parsed = new URL(path, origin)
    if (parsed.searchParams.has('token')) {
      this.reply(res, 400, { error: 'Host tokens are not accepted' })
      return
    }
    if (parsed.pathname === '/_dsh_mobile/pair') {
      await this.pair(req, res)
      return
    }
    const device = this.device(req)
    if (!device) {
      this.reply(res, 401, { error: 'Pair this device on the computer' })
      return
    }
    if (parsed.pathname === '/_dsh_mobile/status') {
      this.reply(res, 200, { connected: true, label: device.label })
      return
    }
    if (parsed.pathname === '/_dsh_mobile/revoke' && req.method === 'POST') {
      this.revoke(device.id)
      this.reply(res, 200, { revoked: true })
      return
    }
    const host = this.options.host()
    if (!host) {
      this.reply(res, 503, { error: 'DSH is not running' })
      return
    }
    const target = new URL(host.url)
    if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))
      throw new Error('Host must stay loopback-only')
    target.pathname = parsed.pathname
    target.search = parsed.search
    const length = req.headers['content-length']
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) {
      this.reply(res, 413, { error: 'Request too large' })
      return
    }
    const blockedRequestHeaders = new Set([
      'origin',
      'referer',
      'authorization',
      'proxy-authorization',
      'forwarded',
      'x-forwarded-for',
      'x-forwarded-host',
      'x-forwarded-proto',
      'sec-fetch-site',
      'connection',
      'upgrade',
      'te',
      'trailer',
    ])
    const headers: OutgoingHttpHeaders = {
      ...Object.fromEntries(Object.entries(req.headers).filter(([key]) => !blockedRequestHeaders.has(key))),
      host: target.host,
      cookie: host.cookie,
    }
    const upstream = httpRequest(target, { method: req.method, headers }, (reply) => {
      const blocked = new Set(['set-cookie', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-authenticate'])
      const outgoing: OutgoingHttpHeaders = {
        ...Object.fromEntries(Object.entries(reply.headers).filter(([key]) => !blocked.has(key))),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      }
      if (typeof outgoing.location === 'string') {
        const redirect = new URL(outgoing.location, target)
        if (redirect.origin === target.origin && !redirect.searchParams.has('token'))
          outgoing.location = origin + redirect.pathname + redirect.search
        else {
          reply.destroy()
          this.reply(res, 502, { error: 'Unexpected upstream redirect' })
          return
        }
      }
      res.writeHead(reply.statusCode ?? 502, outgoing)
      reply.pipe(res)
      reply.once('error', () => res.destroy())
    })
    const close = () => {
      upstream.destroy()
      req.destroy()
      res.destroy()
    }
    let active = this.active.get(device.id)
    if (!active) {
      active = new Set()
      this.active.set(device.id, active)
    }
    active.add(close)
    res.once('close', () => {
      active.delete(close)
      if (active.size === 0) this.active.delete(device.id)
      upstream.destroy()
    })
    upstream.once('error', () => {
      if (!res.headersSent) this.reply(res, 502, { error: 'Computer unavailable' })
      else res.destroy()
    })
    let received = 0
    req.on('data', (chunk: Buffer) => {
      received += chunk.length
      if (received > MAX_BODY) close()
    })
    req.once('aborted', close)
    req.pipe(upstream)
  }
  private upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const origin = this.origin
    const device = this.device(req)
    const host = this.options.host()
    const webSockets = this.webSockets
    const deny = (): void => {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    }
    if (
      !origin ||
      !device ||
      !host ||
      !webSockets ||
      req.headers.host !== new URL(origin).host ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      deny()
      return
    }
    const path = req.url ?? '/'
    if (!path.startsWith('/') || path.startsWith('//')) {
      deny()
      return
    }
    const source = new URL(path, origin)
    const target = new URL(host.url)
    if (
      source.searchParams.has('token') ||
      target.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
    ) {
      deny()
      return
    }
    target.protocol = 'ws:'
    target.pathname = source.pathname
    target.search = source.search
    const protocols = req.headers['sec-websocket-protocol']?.split(',').map(value => value.trim()) ?? []
    const upstream = new WebSocket(target, protocols, {
      headers: { cookie: host.cookie },
      followRedirects: false,
      maxPayload: MAX_BODY,
      handshakeTimeout: 15000,
    })
    let client: WebSocket | undefined
    let active = this.active.get(device.id)
    if (!active) {
      active = new Set()
      this.active.set(device.id, active)
    }
    const close = (): void => {
      upstream.terminate()
      client?.terminate()
      socket.destroy()
      active.delete(close)
      if (active.size === 0) this.active.delete(device.id)
    }
    active.add(close)
    socket.once('close', close)
    upstream.once('error', close)
    upstream.once('close', close)
    upstream.once('open', () => {
      if (!this.enabled || !this.state.devices.some(grant => grant.id === device.id)) {
        close()
        return
      }
      webSockets.handleUpgrade(req, socket, head, (accepted) => {
        client = accepted
        accepted.once('error', close)
        accepted.once('close', close)
        accepted.on('message', (data, binary) => {
          if (upstream.readyState !== WebSocket.OPEN || upstream.bufferedAmount > 4 * 1024 * 1024) {
            close()
            return
          }
          upstream.send(data, { binary })
        })
        upstream.on('message', (data, binary) => {
          if (accepted.readyState !== WebSocket.OPEN || accepted.bufferedAmount > 4 * 1024 * 1024) {
            close()
            return
          }
          accepted.send(data, { binary })
        })
      })
    })
  }
  private async pair(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) {
      this.reply(res, 405, { error: 'Expected JSON POST' })
      return
    }
    this.pairAttempts = this.pairAttempts.filter(time => time > Date.now() - 60000)
    if (this.pairAttempts.length >= 20 || this.pairing) {
      this.reply(res, 429, { error: 'Try again later' })
      return
    }
    this.pairAttempts.push(Date.now())
    let body = ''
    for await (const chunk of req) {
      if (!Buffer.isBuffer(chunk)) throw new Error('Invalid request body chunk')
      body += chunk.toString('utf8')
      if (Buffer.byteLength(body) > 4096) {
        this.reply(res, 413, { error: 'Pair request too large' })
        return
      }
    }
    let value: { code?: unknown; label?: unknown } | null
    try {
      value = JSON.parse(body) as typeof value
    } catch {
      this.reply(res, 400, { error: 'Invalid JSON' })
      return
    }
    const code = this.code
    if (
      !value ||
      !code ||
      code.expires < Date.now() ||
      typeof value.code !== 'string' ||
      !/^[-_A-Za-z0-9]{43}$/.test(value.code) ||
      !equal(value.code, code.secret) ||
      this.state.devices.length >= 8
    ) {
      this.reply(res, 403, { error: 'Invalid or expired pairing code' })
      return
    }
    const label = typeof value.label === 'string' ? value.label.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100) : 'Android device'
    this.pairing = true
    try {
      if (!(await this.options.approve(label)) || this.code !== code || code.expires < Date.now() || !this.enabled) {
        this.reply(res, 403, { error: 'Pairing not approved' })
        return
      }
      this.code = undefined
      const token = random()
      this.state.devices.push({ id: randomUUID(), label, hash: digest(token), createdAt: new Date().toISOString() })
      this.save()
      this.reply(res, 200, { token })
    } finally {
      this.pairing = false
    }
  }
}
