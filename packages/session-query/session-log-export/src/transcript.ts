/** Bounded, read-only conversation access for model tools and external clients. */
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { sessionLogExportDeps } from './archive.ts'
import { sessionMarkdown } from './markdown.ts'

/**
 * Resolve a local identity; never interpret a link as a URL to fetch.
 * @param value - Exact local identity or DSH link.
 * @returns Validated local session identity.
 */
export function transcriptSessionId(value: string): SessionId {
  let id = value
  if (value.startsWith('dsh://')) {
    const match = /^dsh:\/\/session\/([^/?#]+)$/u.exec(value)
    if (match?.[1] === undefined) throw new Error('Expected dsh://session/<id>')
    id = decodeURIComponent(match[1])
  }
  if (!id || id.length > 1024 || /[\x00-\x20/\\?#]/u.test(id) || id.includes('://')) throw new Error('Invalid local session identity')
  return brandString<SessionId>(id)
}

/**
 * Read a frozen log prefix without activating its Agent or modifying its history.
 * @param ctx - Host with the cold session-query service.
 * @param target - Local identity or DSH link.
 * @param offset - Character offset in the frozen transcript.
 * @param throughSeq - Last included sequence, omitted on the first page.
 * @param signal - Calling request cancellation.
 * @param maxChars - Maximum page length.
 * @returns Transcript page and stable pagination coordinates.
 */
export async function readTranscript(
  ctx: Context, target: string, offset: number, throughSeq: number | undefined,
  signal: AbortSignal, maxChars: number,
): Promise<{ sessionId: string; throughSeq: number; text: string; nextOffset: number | null }> {
  if (!Number.isSafeInteger(offset) || offset < 0 || (throughSeq !== undefined && (!Number.isSafeInteger(throughSeq) || throughSeq < 0))) throw new Error('Invalid transcript cursor')
  const sessionId = transcriptSessionId(target)
  const query = sessionLogExportDeps(ctx).sessionQuery
  if (query === undefined) throw new Error('Session reader unavailable')
  using observation = await query.observeSession(sessionId, { signal, projectionMode: 'none' })
  signal.throwIfAborted()
  const last = observation.events.at(-1)?.seq ?? 0
  const end = throughSeq ?? last
  if (end > last) throw new Error('Transcript cursor is newer than the session')
  const events = observation.events.filter(event => event.seq <= end)
  // Keep compacted human history, but omit revisions explicitly superseded by editing.
  const revisions = events.flatMap((event) => {
    if (event.type !== 'developer/message') return []
    const source: { kind: string; startSeq?: unknown; endSeq?: unknown } = event.data.message.source
    if (source.kind !== 'message-edit' || !('startSeq' in source) || !('endSeq' in source)
      || typeof source.startSeq !== 'number' || typeof source.endSeq !== 'number') return []
    return [{ start: source.startSeq, end: source.endSeq }]
  })
  const text = sessionMarkdown(events.filter(event => !revisions.some(range => event.seq >= range.start && event.seq <= range.end)), 'en', true)
  if (offset > text.length) throw new Error('Transcript offset is outside the snapshot')
  let stop = Math.min(text.length, offset + maxChars)
  if (stop < text.length && /[\uD800-\uDBFF]/u.test(text.charAt(stop - 1))) stop--
  return { sessionId, throughSeq: end, text: text.slice(offset, stop), nextOffset: stop < text.length ? stop : null }
}
