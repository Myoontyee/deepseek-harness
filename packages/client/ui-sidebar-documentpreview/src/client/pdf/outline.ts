/** Resolve internal PDF bookmarks without following document-supplied external actions. */
import type { PdfDocument } from './document.ts'

/** PDF.js's nested bookmark entries, including internal destinations. */
export type PdfOutlineItems = NonNullable<Awaited<ReturnType<PdfDocument['getOutline']>>>

/**
 * Resolve one named or explicit bookmark to a validated 1-based page.
 * @param document - owning PDF document.
 * @param destination - bookmark destination supplied by PDF.js.
 * @param signal - navigation lifetime; late results cannot navigate.
 * @returns a document page, or null for missing/unsupported destinations.
 */
export async function outlinePage(document: PdfDocument, destination: PdfOutlineItems[number]['dest'], signal: AbortSignal): Promise<number | null> {
  signal.throwIfAborted()
  const explicit: unknown = typeof destination === 'string' ? await document.getDestination(destination) : destination
  signal.throwIfAborted()
  if (!Array.isArray(explicit) || explicit.length === 0) return null
  const reference: unknown = explicit[0]
  let index: number
  if (typeof reference === 'number') index = reference
  else if (reference !== null && typeof reference === 'object'
    && 'num' in reference && typeof reference.num === 'number' && Number.isInteger(reference.num)
    && 'gen' in reference && typeof reference.gen === 'number' && Number.isInteger(reference.gen)) {
    index = await document.getPageIndex({ num: reference.num, gen: reference.gen })
  } else return null
  signal.throwIfAborted()
  return Number.isInteger(index) && index >= 0 && index < document.numPages ? index + 1 : null
}
