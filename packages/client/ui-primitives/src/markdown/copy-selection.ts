/** Serialize selected content as plain text, retaining links, TeX and Markdown tables. */
import { clipboardLink, clipboardMath, clipboardTable } from './clipboard-text.ts'

const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'BLOCKQUOTE'])
const MATH = '[data-copy-math]'
const CHROME = 'svg,[aria-hidden="true"],button:not([data-copy-file-link]),[data-code-block-banner]'
function trimBreaks(text: string): string { return text.replace(/^\n+|\n+$/gu, '') }
function selectedText(node: Node, markdown = false): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (text.trim() === '' && text.includes('\n')
      && (node.parentElement === null || ['DIV', 'SECTION', 'UL', 'OL', 'TABLE', 'TBODY', 'THEAD', 'TR'].includes(node.parentElement.tagName))) return ''
    return markdown ? text.replace(/[\\\x60*_[\]<>$]/gu, '\\$&') : text
  }
  if (!(node instanceof Element)) return childrenText(node, markdown)
  const math = node.getAttribute('data-copy-math')
  if (math !== null) {
    const display = node.getAttribute('data-copy-math-display') === 'true'
    const text = clipboardMath(math, display)
    return display ? `\n\n${text}\n\n` : text
  }
  if (node.matches(CHROME)) return ''
  if (markdown && (node.tagName === 'PRE' || node.classList.contains('md-code-block'))) {
    const code = node.tagName === 'PRE' ? node.textContent ?? '' : node.querySelector('pre')?.textContent ?? ''
    const fence = '`'.repeat(Math.max(3, ...[...code.matchAll(/`+/gu)].map(match => match[0].length + 1)))
    return '\n\n' + fence + '\n' + code + '\n' + fence + '\n\n'
  }
  if (markdown && node.tagName === 'CODE') {
    const code = node.textContent ?? ''
    const fence = '`'.repeat(Math.max(1, ...[...code.matchAll(/`+/gu)].map(match => match[0].length + 1)))
    return fence + ' ' + code + ' ' + fence
  }
  if (node.classList.contains('md-code-block')) return `\n\n${node.querySelector('pre')?.textContent ?? ''}\n\n`
  if (node.tagName === 'PRE') return `\n\n${node.textContent}\n\n`
  if (node.tagName === 'CODE') return node.textContent
  if (node.tagName === 'TABLE') {
    const rows = [...node.querySelectorAll('tr')].map(row => [...row.children]
      .filter(cell => cell.matches('th,td')).map(cell => childrenText(cell, markdown)))
    return `\n\n${clipboardTable(rows)}\n\n`
  }
  if (node.tagName === 'UL' || node.tagName === 'OL') {
    return `\n${[...node.children].filter(child => child.tagName === 'LI')
      .map((item, index) => (markdown ? node.tagName === 'OL' ? String(Number(node.getAttribute('start') ?? 1) + index) + '. ' : '- ' : '')
        + trimBreaks(childrenText(item, markdown))).join('\n')}\n\n`
  }
  if (node.tagName === 'IMG') return node.getAttribute('alt') ?? ''
  if (node.tagName === 'BR') return '\n'
  if (node.tagName === 'HR') return '\n\n'
  const body = childrenText(node, markdown)
  const link = node.getAttribute('data-copy-file-link') ?? (node.tagName === 'A' ? node.getAttribute('href') : null)
  if (!markdown && link !== null) return clipboardLink(body, link)
  if (markdown) {
    const destination = node.getAttribute('data-copy-file-link') ?? node.getAttribute('href')
    if (destination !== null) return '[' + body + '](<' + destination.replaceAll('<', '%3C').replaceAll('>', '%3E') + '>)'
    if (node.tagName === 'STRONG' || node.tagName === 'B') return '**' + body + '**'
    if (node.tagName === 'EM' || node.tagName === 'I') return '*' + body + '*'
    if (node.tagName === 'DEL') return '~~' + body + '~~'
    if (node.tagName === 'BLOCKQUOTE') return trimBreaks(body).split('\n').map(line => '> ' + line).join('\n') + '\n\n'
    if (/^H[1-6]$/u.test(node.tagName)) return '#'.repeat(Number(node.tagName[1])) + ' ' + body + '\n\n'
  }
  return BLOCKS.has(node.tagName) || /^H[1-6]$/u.test(node.tagName)
    ? body.endsWith('\n\n') ? body : `${body}\n\n`
    : body
}
function childrenText(node: Node, markdown = false): string {
  return [...node.childNodes].map(child => selectedText(child, markdown)).reduce((text, next) =>
    text.endsWith('\n\n') ? text + next.replace(/^\n{1,2}/u, '') : text + next, '')
}
function elementOf(node: Node): Element | null { return node instanceof Element ? node : node.parentElement }

/**
 * Copy selected visible content as plain text, preserving links, formula source and table structure.
 * Formula boundaries are atomic: selecting a subscript copies its complete formula once.
 * @param root - Markdown root containing the complete selection.
 * @param event - Native copy gesture.
 * @returns Whether content copying handled this selection.
 */
export function copyLinkedSelection(root: HTMLElement, event: ClipboardEvent): boolean {
  if (event.clipboardData === null) return false
  const doc = root.ownerDocument
  const selection = doc.getSelection()
  if (selection === null || selection.isCollapsed || selection.rangeCount !== 1) return false
  const selected = selection.getRangeAt(0)
  if (!root.contains(selected.startContainer) || !root.contains(selected.endContainer)) return false
  return writeSelection(event, rangeContent(root, selected))
}

function rangeContent(root: HTMLElement, selected: Range, markdown = false): string {
  const range = selected.cloneRange()
  const firstMath = elementOf(range.startContainer)?.closest(MATH)
  const lastMath = elementOf(range.endContainer)?.closest(MATH)
  if (firstMath !== null && firstMath !== undefined && root.contains(firstMath)) range.setStartBefore(firstMath)
  if (lastMath !== null && lastMath !== undefined && root.contains(lastMath)) range.setEndAfter(lastMath)
  // Recover omitted table/block ancestors to preserve cell boundaries and line breaks.
  let fragment: Node = range.cloneContents()
  let ancestor = elementOf(range.commonAncestorContainer)
  while (ancestor !== null && ancestor !== root && root.contains(ancestor)) {
    const wrapper = ancestor.cloneNode(false)
    wrapper.appendChild(fragment)
    fragment = wrapper
    ancestor = ancestor.parentElement
  }
  const text = selectedText(fragment, markdown)
  const startsInCode = elementOf(selected.startContainer)?.closest('pre,code,.md-code-block') !== null
    && elementOf(selected.startContainer)?.closest('pre,code,.md-code-block') !== undefined
  const endsInCode = elementOf(selected.endContainer)?.closest('pre,code,.md-code-block') !== null
    && elementOf(selected.endContainer)?.closest('pre,code,.md-code-block') !== undefined
  // Remove only serializer boundaries at code edges, retaining source blank lines.
  const start = startsInCode ? text.replace(/^\n{1,2}/u, '') : text.replace(/^\n+/u, '')
  return endsInCode ? start.replace(/\n{1,2}$/u, '') : start.replace(/\n+$/u, '')
}

function writeSelection(event: ClipboardEvent, text: string): boolean {
  if (event.clipboardData === null || text === '') return false
  event.clipboardData.clearData()
  event.clipboardData.setData('text/plain', text)
  // A rendered HTML flavor wins over plain text in rich-text composers and
  // reintroduces math glyph duplication. Only the text flavor is published.
  event.preventDefault()
  return true
}

const documents = new WeakMap<Document, { roots: Map<HTMLElement, 'markdown' | 'literal'>; handler: (event: ClipboardEvent) => void }>()

/**
 * Share one copy listener across Markdown roots, including when the composer retains keyboard focus.
 * @param root - Rendered Markdown root.
 * @returns Subscription release; the final release removes the native listener.
 */
export function registerMarkdownCopy(root: HTMLElement): () => void {
  return registerCopyRoot(root, 'markdown')
}

/**
 * Include visible literal message text in selections spanning rendered Markdown replies.
 * @param root - Literal text container excluding attachments, editors, and message actions.
 * @returns Subscription release; the final release removes the native listener.
 */
export function registerLiteralCopy(root: HTMLElement): () => void {
  return registerCopyRoot(root, 'literal')
}

function registerCopyRoot(root: HTMLElement, kind: 'markdown' | 'literal'): () => void {
  const doc = root.ownerDocument
  let owner = documents.get(doc)
  if (owner === undefined) {
    const roots = new Map<HTMLElement, 'markdown' | 'literal'>()
    const handler = (event: ClipboardEvent): void => {
      // An explicit copy button owns its fallback payload even if a passage is still selected.
      if (doc.querySelector('textarea[data-dsh-clipboard-write]') !== null) return
      const selection = doc.getSelection()
      if (selection === null || selection.rangeCount !== 1) return
      const selected = selection.getRangeAt(0)
      const containingRoot = (node: Node): HTMLElement | undefined => {
        let element = elementOf(node)
        while (element !== null) {
          if (element instanceof HTMLElement && roots.has(element)) return element
          element = element.parentElement
        }
        return undefined
      }
      const first = containingRoot(selected.startContainer)
      const last = containingRoot(selected.endContainer)
      if (first === undefined || last === undefined) return
      if (first === last) {
        if (roots.get(first) === 'literal') return
        if (copyLinkedSelection(first, event)) event.stopPropagation()
        return
      }
      const selectedRoots = [...roots.keys()].filter(candidate => candidate.isConnected && selected.intersectsNode(candidate))
      const outerRoots = selectedRoots.filter(candidate => !selectedRoots.some(other => other !== candidate && other.contains(candidate)))
        .sort((left, right) => left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
      const text = outerRoots.map((candidate) => {
        const bounds = doc.createRange()
        bounds.selectNodeContents(candidate)
        const part = selected.cloneRange()
        if (part.compareBoundaryPoints(Range.START_TO_START, bounds) < 0) part.setStart(candidate, 0)
        if (part.compareBoundaryPoints(Range.END_TO_END, bounds) > 0) part.setEnd(candidate, candidate.childNodes.length)
        if (roots.get(candidate) === 'markdown') return rangeContent(candidate, part)
        const literal = part.cloneContents()
        literal.querySelectorAll('svg,[aria-hidden="true"]').forEach(node => node.remove())
        return literal.textContent ?? ''
      }).filter(value => value !== '').join('\n\n')
      if (writeSelection(event, text)) event.stopPropagation()
    }
    owner = { roots, handler }
    documents.set(doc, owner)
    doc.addEventListener('copy', handler, true)
  }
  owner.roots.set(root, kind)
  const retained = owner
  return () => {
    retained.roots.delete(root)
    if (retained.roots.size === 0) {
      doc.removeEventListener('copy', retained.handler, true)
      documents.delete(doc)
    }
  }
}

/**
 * Preserve selected response structure as Markdown, with atomic original TeX formulas.
 * @param root - Content owner containing both ends of the selection.
 * @param selected - Selected passage; never modified.
 * @returns Markdown for the selected passage, or empty text outside the owner.
 */
export function annotationSelectionMarkdown(root: HTMLElement, selected: Range): string {
  if (!root.contains(selected.startContainer) || !root.contains(selected.endContainer)) return ''
  return rangeContent(root, selected, true)
}

/** Copy visible message contents while retaining formula sources and table structure.
 * @param root - Rendered message content without attachment or action chrome.
 * @returns Content-only clipboard text; hidden secret originals are never consulted.
 */
export function renderedClipboardText(root: HTMLElement): string {
  return trimBreaks(childrenText(root, false))
}
