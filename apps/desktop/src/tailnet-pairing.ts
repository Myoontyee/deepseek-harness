/** QR-free bootstrap over a daemon-verified Tailnet connection; no Host cookie is returned. */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'

/** Public connection material returned only after local user approval. */
export interface TailnetConnection { url: string; pin: string; token: string }
/** Tailnet identity and local approval belong to the Desktop controller. */
export interface TailnetPairingOptions {
  verify(address: string): Promise<string>
  authorize(name: string, signal: AbortSignal): Promise<TailnetConnection>
}
/** Create the request handler shared by the Tailnet-only listener and transport tests.
 * @param authority - Exact bound address and protocol port.
 * @param options - Identity verifier and explicit operator approval.
 * @returns A bounded HTTP bootstrap handler.
 */
export function createTailnetPairingHandler(
  authority: string, options: TailnetPairingOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  let active: AbortController | undefined
  let attempts: number[] = []
  return (req, res) => {
    const reply = (status: number, value: unknown): void => { if (!res.destroyed) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)) } }
    if (req.headers.host !== authority || req.headers.origin) { reply(403, { error: 'Untrusted origin' }); return }
    if (req.method === 'GET' && req.url === '/v1/status') {
      reply(200, { service: 'deepseek-harness-desktop', protocol: 1 })
      return
    }
    if (req.method !== 'POST' || req.url !== '/v1/pair') { reply(404, { error: 'Unknown request' }); return }
    if (req.headers['content-type'] !== 'application/json') { reply(415, { error: 'JSON required' }); return }
    attempts = attempts.filter(time => time > Date.now() - 60000)
    if (active) { res.setHeader('retry-after', '3'); reply(429, { code: 'approval_busy', error: 'Waiting for approval on the computer' }); return }
    if (attempts.length >= 20) { res.setHeader('retry-after', '60'); reply(429, { code: 'rate_limited', error: 'Too many connection attempts' }); return }
    attempts.push(Date.now())
    const controller = new AbortController()
    active = controller
    let verified = false
    const release = (): void => { if (active === controller) active = undefined }
    const timer = setTimeout(() => {
      controller.abort(); release()
      reply(408, { code: 'approval_timeout', error: 'Computer approval timed out' })
    }, 55000)
    res.once('close', () => { controller.abort(); release(); clearTimeout(timer) })
    void (async () => {
      let size = 0
      for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 256) { reply(413, { error: 'Request too large' }); return } }
      const address = (req.socket.remoteAddress ?? '').replace(/^::ffff:/u, '')
      const name = await options.verify(address)
      verified = true
      if (controller.signal.aborted) return
      const connection = await options.authorize(name, controller.signal)
      if (!controller.signal.aborted) reply(200, connection)
    })().catch(() => {
      if (!controller.signal.aborted) reply(403, { code: verified ? 'approval_rejected' : 'identity_rejected', error: 'Device identity or local approval failed' })
    }).finally(() => { release(); clearTimeout(timer) })
  }
}
/** One small bootstrap listener bound exclusively to a concrete Tailnet IPv4 address. */
export class TailnetPairingServer {
  private server: Server | undefined
  /** @param address - Local Tailscale address. @param options - Verified approval operations. */
  constructor(readonly address: string, private readonly options: TailnetPairingOptions) {}
  /** Bind the fixed discovery protocol port; never listen on all network interfaces. */
  async start(): Promise<void> {
    if (!/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/u.test(this.address)) throw new Error('Tailnet listener requires a Tailscale address')
    const server = createServer(createTailnetPairingHandler(`${this.address}:42873`, this.options))
    server.headersTimeout = 5000; server.requestTimeout = 10000; server.keepAliveTimeout = 1000
    try { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(42873, this.address, () => { server.off('error', reject); resolve() }) }) }
    catch (error) { server.close(); throw error }
    this.server = server
  }
  /** Close the listener and cancel requests awaiting approval. */
  async stop(): Promise<void> {
    const server = this.server; this.server = undefined
    if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => { server.close(() => { resolve() }) }) }
  }
}
