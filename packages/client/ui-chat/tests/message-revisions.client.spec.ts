import { describe, expect, it } from 'vitest'
import type { ChatConversationViewNode } from '../src/client/contract/chat-nodes.ts'
import { ChatSnapshotBuilder } from '../src/client/conversation-nodes/chat-snapshot-builder.ts'

const timeline = { turnOrder: [], turns: new Map() }
function user(seq: number, kind = 'user'): ChatConversationViewNode {
  return { key: `user:${seq}`, id: String(seq), target: 'chat', kind, anchorSeq: seq,
    location: { kind: 'session' }, visibility: 'visible',
    data: { kind, seq, time: seq, content: [{ type: 'text', text: `request ${seq}` }], source: null } }
}
function revision(seq: number, startSeq: number, endSeq: number): ChatConversationViewNode {
  return { key: `context:${seq}`, id: String(seq), target: 'chat', kind: 'context', anchorSeq: seq,
    location: { kind: 'session' }, visibility: 'hidden',
    data: { kind: 'context', seq, time: seq, content: [], source: { kind: 'message-edit', startSeq, endSeq } } }
}

describe('same-session message revisions', () => {
  it('hides the superseded tail on arrival and replay while retaining physical nodes', () => {
    const builder = new ChatSnapshotBuilder()
    const first = user(1), old = user(5), replacement = user(10), marker = revision(9, 5, 8)
    expect(builder.replace({ nodes: [first, old], timeline }).editableMessageSeq).toBe(5)
    const withdrawn = builder.apply({ upserts: [marker], timeline })
    expect(withdrawn.nodes.get(old.key)?.visibility).toBe('hidden')
    expect(withdrawn.order).toEqual([first.key])
    expect(withdrawn.editableMessageSeq).toBeUndefined()
    const saved = builder.apply({ upserts: [replacement], timeline })
    expect(saved.order).toEqual([first.key, replacement.key])
    expect(saved.editableMessageSeq).toBe(10)
    const replay = new ChatSnapshotBuilder().replace({ nodes: [first, old, marker, replacement], timeline })
    expect(replay.order).toEqual(saved.order)
    expect(replay.editableMessageSeq).toBe(10)
    expect(replay.nodes.get(old.key)).toBeDefined()
  })

  it('does not offer an earlier prompt after a steering message and rejects malformed revision ranges', () => {
    const builder = new ChatSnapshotBuilder()
    const snapshot = builder.replace({ nodes: [user(1), user(4, 'steering')], timeline })
    expect(snapshot.editableMessageSeq).toBeUndefined()
    expect(() => builder.apply({ upserts: [revision(9, 5, 10)], timeline })).toThrow('Invalid message revision range')
  })
})
