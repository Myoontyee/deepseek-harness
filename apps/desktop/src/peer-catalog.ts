/** Display-only remote workspace catalogs; authorization material never reaches the renderer. */
import { randomUUID } from 'node:crypto'
import { peerJson } from './peer-transport.ts'

/** Public conversation row in a remote computer's catalog. */
export interface PeerConversation {
  id: string
  title: string
  running: boolean
  workspaceId: string
  updatedAt: number
  archived: boolean
}
/** A registered remote workspace or an older peer's conversation directory. */
export interface PeerWorkspace { id: string; title: string; path: string }
/** One successful refresh; older peers can provide directory grouping with a visible warning. */
export interface PeerCatalog { sessions: PeerConversation[]; workspaces: PeerWorkspace[]; warning: string }

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('远端目录数据无效')
  return value as Record<string, unknown>
}
function result(value: unknown): Record<string, unknown> {
  const envelope = record(record(value).result)
  if (envelope.ok === false) throw new Error('远端未提供可读取的工作区目录')
  return record(envelope.value)
}
function directoryKey(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/u, '')
  return /^[a-z]:\//iu.test(normalized) ? normalized.toLowerCase() : normalized
}
/**
 * Group admitted conversations under registered workspaces, preserving archived identities.
 * @param sessions - Session/list response from the pinned, authorized peer.
 * @param workspaces - Workspace/list response, when the peer supports it.
 * @returns Display metadata only, with stable identities scoped by the caller to its device.
 */
export function parsePeerCatalog(sessions: unknown, workspaces?: unknown): PeerCatalog {
  const rows = result(sessions).items
  if (!Array.isArray(rows)) throw new Error('远端未返回对话列表')
  const groups: PeerWorkspace[] = []
  const members = new Map<string, string>()
  const paths = new Map<string, string>()
  const archived = new Set<string>()
  if (workspaces !== undefined) {
    const baseline = result(workspaces)
    if (!Array.isArray(baseline.items) || !Array.isArray(baseline.archivedSessionIds)) throw new Error('远端未返回工作区列表')
    for (const raw of baseline.items) {
      const item = record(raw)
      if (typeof item.workspaceId !== 'string' || typeof item.title !== 'string' || typeof item.path !== 'string'
        || !Array.isArray(item.sessionIds)) throw new Error('远端工作区信息不完整')
      groups.push({ id: item.workspaceId, title: item.title, path: item.path })
      paths.set(directoryKey(item.path), item.workspaceId)
      for (const id of item.sessionIds) if (typeof id === 'string') members.set(id, item.workspaceId)
    }
    for (const id of baseline.archivedSessionIds) if (typeof id === 'string') archived.add(id)
  }
  const conversations: PeerConversation[] = []
  for (const raw of rows) {
    const item = record(raw)
    if (typeof item.sessionId !== 'string') throw new Error('远端对话标识无效')
    if (item.origin === 'subagent' || item.blank === true) continue
    const path = typeof item.cwd === 'string' ? item.cwd : ''
    let workspaceId = members.get(item.sessionId) ?? paths.get(directoryKey(path))
    if (workspaceId === undefined) {
      workspaceId = `directory:${directoryKey(path)}`
      if (!groups.some(group => group.id === workspaceId)) {
        groups.push({ id: workspaceId, title: path.split(/[\\/]/u).filter(Boolean).at(-1) ?? '', path })
      }
    }
    const projection = item.projections === undefined ? {} : record(item.projections)
    const values = projection.values === undefined ? {} : record(projection.values)
    conversations.push({ id: item.sessionId, title: typeof values.title === 'string' && values.title ? values.title : item.sessionId,
      running: item.running === true, workspaceId, updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
      archived: archived.has(item.sessionId) })
  }
  conversations.sort((a, b) => b.updatedAt - a.updatedAt)
  return { sessions: conversations, workspaces: groups, warning: workspaces === undefined ? '远端尚未同步工作区名称，暂按对话目录显示' : '' }
}
/**
 * Fetch both catalogs through the existing pinned transport, without keeping remote streams open.
 * @param grant - Locally encrypted, previously approved device authorization.
 * @param exchange - Certificate-verified RPC transport.
 * @returns Workspace titles, conversation summaries and any grouping warning.
 */
export async function readPeerCatalog(
  grant: { url: string; pin: string; token: string }, exchange = peerJson,
): Promise<PeerCatalog> {
  const call = (method: string): Promise<unknown> => exchange(grant.url, grant.pin, `/api/${method}`,
    { type: 'client-request', rpcId: randomUUID(), method, payload: { args: method === 'session/list' ? { _request: {} } : {} } }, grant.token)
  const sessions = await call('session/list')
  let workspaces: unknown
  try { workspaces = await call('workspace/list'); return parsePeerCatalog(sessions, workspaces) }
  catch (error) {
    // Session access succeeded; retain directory grouping when workspace RPC is absent or temporarily unavailable.
    const catalog = parsePeerCatalog(sessions)
    catalog.warning = error instanceof Error ? `工作区分组暂不可用：${error.message}` : catalog.warning
    return catalog
  }
}
