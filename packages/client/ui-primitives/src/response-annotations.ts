/** Text-only annotation envelope shared by composer serialization and transcript presentation. */

/** A quoted passage and the user's optional comment, with its original conversation address. */
export interface ResponseAnnotation {
  readonly text: string
  readonly comment: string
  readonly sourceUrl: string
  readonly sourceLabel: string
  readonly sourceMessage: string
}

const START = '<dsh-response-annotations>\n'
const END = '\n</dsh-response-annotations>\n\n'

/**
 * Keep quoted passages separate from the user's request in the persisted text block.
 * @param text - User-written request, which can be empty.
 * @param annotations - Ordered quotations and comments captured at submission.
 * @returns Ordinary prompt text, including the annotation envelope when present.
 */
export function serializeResponseAnnotations(text: string, annotations: readonly ResponseAnnotation[]): string {
  if (annotations.length === 0) return text
  const payload = JSON.stringify({ version: 1, annotations: annotations.map(({ text, comment, sourceUrl, sourceLabel, sourceMessage }) => (
    { text, comment, sourceUrl, sourceLabel, sourceMessage }
  )) }).replaceAll('<', '\\u003c')
  return `${START}${payload}${END}${text}`
}

/**
 * Recognize the complete annotation envelope without hiding malformed or ordinary user text.
 * @param text - Persisted or pending user-message text.
 * @returns Parsed annotations and remaining request, or null for ordinary text.
 */
export function parseResponseAnnotations(text: string): { annotations: readonly ResponseAnnotation[]; text: string } | null {
  if (!text.startsWith(START)) return null
  const end = text.indexOf(END, START.length)
  if (end === -1) return null
  let parsed: unknown
  try { parsed = JSON.parse(text.slice(START.length, end)) }
  catch (_error) { return null /* Incomplete envelopes remain visible as ordinary user text. */ }
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed) || parsed.version !== 1
    || !('annotations' in parsed) || !Array.isArray(parsed.annotations) || parsed.annotations.length === 0) return null
  const annotations: ResponseAnnotation[] = []
  const items: readonly unknown[] = parsed.annotations
  for (const item of items) {
    if (typeof item !== 'object' || item === null
      || !('text' in item) || typeof item.text !== 'string'
      || !('comment' in item) || typeof item.comment !== 'string'
      || !('sourceUrl' in item) || typeof item.sourceUrl !== 'string'
      || !('sourceLabel' in item) || typeof item.sourceLabel !== 'string'
      || !('sourceMessage' in item) || typeof item.sourceMessage !== 'string') return null
    annotations.push({ text: item.text, comment: item.comment, sourceUrl: item.sourceUrl,
      sourceLabel: item.sourceLabel, sourceMessage: item.sourceMessage })
  }
  return { annotations, text: text.slice(end + END.length) }
}
