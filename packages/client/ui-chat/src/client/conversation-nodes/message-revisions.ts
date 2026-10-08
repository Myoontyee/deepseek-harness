/** Projects durable message-revision ranges into Chat visibility without discarding audit history. */
import type { ChatConversationViewNode, ChatNode } from '../contract/chat-nodes.ts'
import type { ChatNodeStore } from '../contract/snapshot.ts'

interface RevisionRange { start: number; end: number }
function revision(node: ChatConversationViewNode): RevisionRange | undefined {
  const value = node as ChatNode
  if (value.kind !== 'context') return undefined
  const source = value.data.source
  if (typeof source !== 'object' || source === null || !('kind' in source) || source.kind !== 'message-edit') return undefined
  if (!('startSeq' in source) || typeof source.startSeq !== 'number'
    || !('endSeq' in source) || typeof source.endSeq !== 'number') throw new Error('Invalid message revision range')
  const { startSeq: start, endSeq: end } = source
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= node.anchorSeq) {
    throw new Error('Invalid message revision range')
  }
  return { start, end }
}

/** Revisions invalidate their selected transcript tail only when an explicit edit record arrives. */
export class MessageRevisionProjector {
  private readonly ranges = new Map<string, RevisionRange>()
  private editable: number | undefined
  private lastHumanSeq = -1
  /** Last visible ordinary human message eligible for the editing action. */
  get editableMessageSeq(): number | undefined { return this.editable }
  /** @param nodes - Complete loaded Chat nodes. @returns Nodes with superseded ranges hidden. */
  replace(nodes: readonly ChatConversationViewNode[]): readonly ChatConversationViewNode[] {
    this.ranges.clear()
    this.editable = undefined
    this.lastHumanSeq = -1
    for (const node of nodes) {
      const range = revision(node)
      if (range !== undefined) this.ranges.set(node.key, range)
    }
    return nodes.map(node => this.project(node))
  }
  /** @param nodes - Changed nodes. @param store - Current keyed nodes. @returns Visibility changes plus ordinary updates. */
  apply(nodes: readonly ChatConversationViewNode[], store: ChatNodeStore): readonly ChatConversationViewNode[] {
    let changed = false
    for (const node of nodes) {
      const range = revision(node)
      if (range !== undefined && !this.ranges.has(node.key)) { this.ranges.set(node.key, range); changed = true }
    }
    if (!changed) return nodes.map(node => this.project(node))
    this.editable = undefined
    this.lastHumanSeq = -1
    const merged = new Map(store.values().map(node => [node.key, node]))
    for (const node of nodes) merged.set(node.key, node)
    // Explicit revision invalidates a whole tail once; ordinary streaming reads only its upserts.
    return [...merged.values()].map(node => this.project(node))
  }
  private project(node: ChatConversationViewNode): ChatConversationViewNode {
    const hidden = [...this.ranges.values()].some(range => node.anchorSeq >= range.start && node.anchorSeq <= range.end)
    const value = node as ChatNode
    if ((value.kind === 'user' || value.kind === 'steering') && value.data.seq >= this.lastHumanSeq) {
      this.lastHumanSeq = value.data.seq
      this.editable = !hidden && node.visibility === 'visible' && value.kind === 'user' ? value.data.seq : undefined
    }
    return hidden && node.visibility !== 'hidden' ? { ...node, visibility: 'hidden' } : node
  }
}
