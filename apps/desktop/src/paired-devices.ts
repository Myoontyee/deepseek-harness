import { pairingOrigin, peerJson } from './peer-transport.ts'
/** Desktop-to-Desktop grants and pinned transport; renderer code never receives credentials. */
import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { hostname } from 'node:os'
import { discoverTailDevices } from './tailscale-discovery.ts'
import { probeTailnetConnection, requestTailnetConnection } from './tailnet-connect.ts'
import { readPeerCatalog, type PeerCatalog } from './peer-catalog.ts'

interface Grant { id: string; name: string; url: string; pin: string; token: string }
interface State { version: 1; detect: boolean; grants: Grant[] }
interface PeerReply { ok: boolean; value?: unknown; error?: { message?: unknown } }
function assertConnecting(signal: AbortSignal): void { if (signal.aborted) throw new Error('已取消连接申请') }
function replyValue(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('远端返回了无效数据')
  const envelope = (value as { result?: unknown }).result
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('远端返回了无效数据')
  const reply = envelope as PeerReply
  if (!reply.ok) {
    const message = reply.error?.message
    throw new Error(typeof message === 'string' && message ? message : '远端操作失败')
  }
  if (reply.value === null || typeof reply.value !== 'object' || Array.isArray(reply.value)) throw new Error('远端返回了无效数据')
  return reply.value as Record<string, unknown>
}
/** Manage encrypted local grants and explicit remote reads. */
export class PairedDevices {
  private state: State = { version: 1, detect: false, grants: [] }
  private readonly path = join(app.getPath('userData'), 'paired-computers.dat')
  constructor() {
    try {
      const value = JSON.parse(safeStorage.decryptString(readFileSync(this.path))) as Partial<State>
      if (value.version !== 1 || typeof value.detect !== 'boolean' || !Array.isArray(value.grants) || value.grants.length > 32) throw new Error('Invalid device storage')
      for (const grant of value.grants) {
        pairingOrigin(grant.url)
        if (!/^[a-f0-9]{64}$/u.test(grant.pin) || !/^[\w-]{43}$/u.test(grant.token) || typeof grant.name !== 'string' || typeof grant.id !== 'string') throw new Error('Invalid device grant')
      }
      this.state = { version: 1, detect: value.detect, grants: value.grants }
    } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
  }
  private save(next: State): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密服务不可用，无法保存设备授权')
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path + '.tmp', safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600 })
    renameSync(this.path + '.tmp', this.path)
    this.state = next
  }
  /** Persist the user's discovery preference; discovering never grants access. */
  detect(enabled: boolean): void { this.save({ ...this.state, detect: enabled }) }
  private async peer(id: string) {
    const peer = (await discoverTailDevices()).find(item => item.id === id)
    if (!peer || peer.self || !peer.online) throw new Error('所选设备不在线或不在当前 Tailscale 列表中，请刷新后重试')
    return peer
  }
  /** Check the selected peer's service; discovering a machine alone never grants access.
   * @param id - Current local Tailscale daemon's opaque device ID.
   */
  async probeTailnet(id: string): Promise<void> { await probeTailnetConnection((await this.peer(id)).address) }
  /** Request approval on a freshly discovered computer and encrypt its validated grant.
   * @param id - Current local Tailscale daemon's opaque device ID.
   * @param signal - Cancels approval when the requesting view closes or its operator cancels.
   */
  async pairTailnet(id: string, signal: AbortSignal): Promise<void> {
    const peer = await this.peer(id)
    assertConnecting(signal)
    if (this.state.grants.length >= 32) throw new Error('请先移除不再使用的设备')
    const connection = await requestTailnetConnection(peer.address, signal)
    assertConnecting(signal)
    this.save({ ...this.state, grants: [...this.state.grants.filter(item => item.url !== connection.url), {
      id: randomUUID(), name: peer.name, ...connection,
    }] })
  }
  /** List public device metadata, separating discovery from paired authorization. */
  async list() {
    let warning = ''
    const peers = this.state.detect ? await discoverTailDevices().catch(() => { warning = '无法读取 Tailscale 设备，请确认已安装、启动并登录'; return [] }) : []
    const paired = this.state.grants.map(({ id, name, url }) => ({ id, name, address: new URL(url).hostname }))
    return { detect: this.state.detect, peers, warning, paired }
  }
  /** Exchange a one-use invitation and retain only the resulting encrypted grant. */
  async pair(code: string, name: string): Promise<void> {
    if (code.length > 4096 || !code.startsWith('dsh-pair-v1:') || !name.trim() || name.length > 200) throw new Error('请输入设备名称和完整配对码')
    if (this.state.grants.length >= 32) throw new Error('请先移除不再使用的设备')
    const value = JSON.parse(Buffer.from(code.slice(12), 'base64url').toString('utf8')) as { url: string; pin: string; code: string }
    const url = pairingOrigin(value.url)
    if (!/^[\w-]{43}$/u.test(value.code)) throw new Error('配对码无效')
    const result = await peerJson(url, value.pin, '/_dsh_mobile/pair', { code: value.code, label: hostname() }) as { token?: unknown }
    if (typeof result.token !== 'string' || !/^[\w-]{43}$/u.test(result.token)) throw new Error('设备未返回有效授权')
    const grant = { id: randomUUID(), name: name.trim(), url, pin: value.pin, token: result.token }
    this.save({ ...this.state, grants: [...this.state.grants.filter(item => item.url !== url), grant] })
  }
  /** Resolve only a previously paired identity, never caller-supplied endpoints. */
  grant(id: string): Grant { const grant = this.state.grants.find(item => item.id === id); if (!grant) throw new Error('设备未配对'); return grant }
  /** Forget one computer locally. Its owner can additionally revoke the grant remotely. */
  forget(id: string): void { this.save({ ...this.state, grants: this.state.grants.filter(item => item.id !== id) }) }
  /** Read a paired computer's workspace titles and grouped conversations.
   * @param id - Saved device identity; caller-supplied network addresses are never accepted.
   * @returns Display metadata without credentials.
   */
  workspaceCatalog(id: string): Promise<PeerCatalog> { return readPeerCatalog(this.grant(id)) }
  private async remote(id: string, method: string, args: unknown): Promise<Record<string, unknown>> {
    const grant = this.grant(id)
    const result = await peerJson(grant.url, grant.pin, `/api/${method}`,
      { type: 'client-request', rpcId: randomUUID(), method, payload: { args } }, grant.token)
    return replyValue(result)
  }
  /** Create one blank conversation inside a remote Workspace and return its identity.
   * @param id - Saved device identity.
   * @param workspaceId - Remote Workspace that owns the new conversation directory.
   * @returns Created conversation identity, or a reusable blank conversation's identity.
   */
  async createConversation(id: string, workspaceId: string): Promise<string> {
    const value = await this.remote(id, 'session/create', { request: { workspaceId } })
    if (typeof value.sessionId !== 'string' || !value.sessionId) throw new Error('远端没有返回新对话')
    return value.sessionId
  }
  /** Register one existing remote directory as a Workspace.
   * @param id - Saved device identity.
   * @param path - Absolute directory on the remote computer.
   * @returns Display metadata for the created or already registered Workspace.
   */
  async createWorkspace(id: string, path: string): Promise<{ id: string; title: string; path: string }> {
    if (path.length > 4096 || !/^(?:[a-zA-Z]:[\\/]|[\\/])/u.test(path) || path.includes('\0')) {
      throw new Error('请输入远端电脑上的绝对路径')
    }
    const value = await this.remote(id, 'workspace/create', { request: { path } })
    const workspace = value.workspace
    if (workspace === null || typeof workspace !== 'object' || Array.isArray(workspace)) throw new Error('远端没有返回工作区')
    const item = workspace as Record<string, unknown>
    if (typeof item.workspaceId !== 'string' || typeof item.title !== 'string' || typeof item.path !== 'string') {
      throw new Error('远端返回了无效工作区')
    }
    return { id: item.workspaceId, title: item.title, path: item.path }
  }
  /** Read remote conversation summaries without starting work on the remote device. */
  async conversations(id: string) {
    const grant = this.grant(id)
    const result = await peerJson(grant.url, grant.pin, '/api/session/list', { type: 'client-request', rpcId: randomUUID(), method: 'session/list', payload: { args: { _request: {} } } }, grant.token) as { result?: { value?: { items?: unknown[] } } }
    const items = result.result?.value?.items
    if (!Array.isArray(items)) throw new Error('无法读取远端对话，请升级远端 DSH 或重新配对')
    return items.flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return []
      const item = raw as Record<string, unknown>
      if (typeof item.sessionId !== 'string') return []
      if (item.origin === 'subagent') return []
      const projection = item.projections as { values?: { title?: unknown } } | undefined
      const title = projection?.values?.title
      return [{ id: item.sessionId, title: typeof title === 'string' && title ? title : item.sessionId, running: item.running === true }]
    }).slice(0, 2000)
  }
}
