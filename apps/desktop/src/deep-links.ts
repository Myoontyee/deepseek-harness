/** Parse external activation links without permitting document navigation. */

/** External links may only activate the application or select a local conversation. */
export type DesktopLink = { readonly kind: 'open' } | { readonly kind: 'session'; readonly sessionId: string }

/**
 * Decode the conversation identity from one complete application link.
 * @param value - Operating-system link or process argument.
 * @returns A supported activation, or undefined for unrelated and malformed input.
 */
export function parseDesktopLink(value: string): DesktopLink | undefined {
  if (value === 'dsh://open' || value === 'dsh://open/') return { kind: 'open' }
  const encodedSessionId = /^dsh:\/\/session\/([^/?#]+)$/u.exec(value)?.[1]
  if (encodedSessionId === undefined) return undefined
  let sessionId: string
  try { sessionId = decodeURIComponent(encodedSessionId) }
  catch (_error: unknown) { return undefined }
  if (/[\u0000-\u001f\u007f]/u.test(sessionId)) return undefined
  return { kind: 'session', sessionId }
}
