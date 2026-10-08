/** Preserve link destinations when copying a selected Markdown passage. */

const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'BLOCKQUOTE', 'UL', 'OL', 'TABLE', 'TR'])
const ALLOWED_HTML = new Set(['P', 'DIV', 'SPAN', 'STRONG', 'EM', 'DEL', 'CODE', 'PRE', 'BLOCKQUOTE',
  'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'A'])

function linkOf(node: Node): Element | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
  return element?.closest('[data-copy-file-link],a[href]') ?? null
}
function destination(element: Element): string | null {
  const file = element.getAttribute('data-copy-file-link')
  if (file !== null) return file.replaceAll('\\', '/')
  const href = element.getAttribute('href')
  return href !== null && /^(?:https?:|mailto:|dsh:)/iu.test(href) ? href : null
}
function escapeText(text: string): string { return text.replace(/[\\`*_[\]<>]/gu, '\\$&') }
function markdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (node.parentElement?.tagName === 'DIV' && text.trim() === '' && text.includes('\n')) return ''
    return escapeText(text)
  }
  if (!(node instanceof Element)) return [...node.childNodes].map(markdown).join('')
  if (node.matches('svg,[aria-hidden="true"]')) return ''
  const body = [...node.childNodes].map(markdown).join('')
  const href = destination(node)
  if (href !== null && body !== '') return `[${body}](<${href.replace(/[<>\s]/gu, encodeURIComponent)}>)`
  if (node.tagName === 'BR') return '\n'
  if (node.tagName === 'PRE') {
    const text = node.textContent
    const ticks = Math.max(3, ...(text.match(/`+/gu) ?? []).map(value => value.length + 1))
    return `\n${'`'.repeat(ticks)}\n${text}\n${'`'.repeat(ticks)}\n\n`
  }
  if (node.tagName === 'CODE') {
    const text = node.textContent
    const ticks = '`'.repeat(Math.max(1, ...(text.match(/`+/gu) ?? []).map(value => value.length + 1)))
    return `${ticks} ${text} ${ticks}`
  }
  if (/^H[1-6]$/u.test(node.tagName)) return `${'#'.repeat(Number(node.tagName.slice(1)))} ${body}\n\n`
  if (node.tagName === 'STRONG') return `**${body}**`
  if (node.tagName === 'EM') return `*${body}*`
  if (node.tagName === 'DEL') return `~~${body}~~`
  if (node.tagName === 'LI') return `- ${body.trim()}\n`
  if (node.tagName === 'TD' || node.tagName === 'TH') return `${body}\t`
  return BLOCKS.has(node.tagName) ? `${body}\n\n` : body
}
function cleanHtml(node: Node, doc: Document): Node {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent ?? '')
  if (!(node instanceof Element) || node.matches('svg,[aria-hidden="true"]')) return doc.createTextNode('')
  const href = destination(node)
  const tag = href !== null ? 'a' : ALLOWED_HTML.has(node.tagName) ? node.tagName.toLowerCase() : 'span'
  const clean = doc.createElement(tag)
  if (href !== null) {
    const local = node.hasAttribute('data-copy-file-link')
    const value = local && /^[a-z]:\//iu.test(href) ? `file:///${href}`
      : local && href.startsWith('/') ? `file://${href}` : href
    clean.setAttribute('href', value.replace(/[<>\s]/gu, encodeURIComponent))
  }
  for (const child of node.childNodes) clean.append(cleanHtml(child, doc))
  return clean
}

/**
 * Copy only the selected content, retaining local and web link addresses.
 * @param root - Markdown root containing the complete selection.
 * @param event - Native copy gesture.
 * @returns Whether link-aware copying handled this selection.
 */
export function copyLinkedSelection(root: HTMLElement, event: ClipboardEvent): boolean {
  if (event.clipboardData === null) return false
  const doc = root.ownerDocument
  const selection = doc.getSelection()
  if (selection === null || selection.isCollapsed || selection.rangeCount !== 1) return false
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return false
  const fragment = doc.createElement('div')
  const contents = range.cloneContents()
  const enclosing = linkOf(range.startContainer)
  if (enclosing !== null && enclosing === linkOf(range.endContainer) && root.contains(enclosing)) {
    const anchor = enclosing.cloneNode(false)
    anchor.appendChild(contents)
    fragment.append(anchor)
  } else fragment.append(contents)
  if (![...fragment.querySelectorAll('[data-copy-file-link],a[href]')].some(element => destination(element) !== null)) return false
  const text = markdown(fragment).trim()
  if (text === '') return false
  event.clipboardData.setData('text/plain', text)
  event.clipboardData.setData('text/markdown', text)
  const html = doc.createElement('div')
  for (const node of fragment.childNodes) html.append(cleanHtml(node, doc))
  event.clipboardData.setData('text/html', html.innerHTML)
  event.preventDefault()
  return true
}

const documents = new WeakMap<Document, { roots: Set<HTMLElement>; handler: (event: ClipboardEvent) => void }>()

/**
 * Share one copy listener across Markdown roots, including when the composer retains keyboard focus.
 * @param root - Rendered Markdown root.
 * @returns Subscription release; the final release removes the native listener.
 */
export function registerMarkdownCopy(root: HTMLElement): () => void {
  const doc = root.ownerDocument
  let owner = documents.get(doc)
  if (owner === undefined) {
    const roots = new Set<HTMLElement>()
    const handler = (event: ClipboardEvent): void => {
      const selection = doc.getSelection()
      if (selection === null || selection.rangeCount !== 1) return
      const node = selection.getRangeAt(0).startContainer
      let element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
      while (element !== null && !(element instanceof HTMLElement && roots.has(element))) element = element.parentElement
      if (element instanceof HTMLElement && copyLinkedSelection(element, event)) event.stopPropagation()
    }
    owner = { roots, handler }
    documents.set(doc, owner)
    doc.addEventListener('copy', handler, true)
  }
  owner.roots.add(root)
  const retained = owner
  return () => {
    retained.roots.delete(root)
    if (retained.roots.size === 0) {
      doc.removeEventListener('copy', retained.handler, true)
      documents.delete(doc)
    }
  }
}
