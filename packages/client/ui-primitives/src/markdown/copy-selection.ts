/** Serialize selected Markdown passages, preserving TeX and link destinations. */

const BLOCKS = new Set(['P', 'DIV', 'SECTION'])
const MATH = '[data-copy-math]'
const CHROME = 'svg,[aria-hidden="true"],button:not([data-copy-file-link]),[data-code-block-banner]'

function destination(element: Element): string | null {
  const file = element.getAttribute('data-copy-file-link')
  if (file !== null) return file.replaceAll('\\', '/')
  const href = element.getAttribute('href')
  return href !== null && /^(?:https?:|mailto:|dsh:)/iu.test(href) ? href : null
}
function escapeText(text: string): string {
  // A TeX command appearing as literal text (e.g. \begin{equation}) must not
  // acquire another backslash. Only escape Markdown-active backslashes.
  return text.replace(/\\(?=[\\`*_[\]<>])/gu, '\\\\').replace(/[`*_[\]<>]/gu, '\\$&')
}
function mathSource(element: Element): string | null {
  const source = element.getAttribute('data-copy-math')
  if (source === null) return null
  return element.getAttribute('data-copy-math-display') === 'true'
    ? `\n\n$$\n${source.trim()}\n$$\n\n` : `$${source}$`
}
function markdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (text.trim() === '' && text.includes('\n')
      && (node.parentElement === null || ['DIV', 'SECTION', 'UL', 'OL', 'TABLE', 'TBODY', 'THEAD', 'TR'].includes(node.parentElement.tagName))) return ''
    return escapeText(text)
  }
  if (!(node instanceof Element)) return childrenMarkdown(node)
  const math = mathSource(node)
  if (math !== null) return math
  if (node.matches(CHROME)) return ''
  if (node.classList.contains('md-code-block')) {
    const pre = node.querySelector('pre')
    return pre === null ? '' : fencedCode(pre, node.getAttribute('data-copy-code-language') ?? '')
  }
  if (node.tagName === 'PRE') return fencedCode(node, node.querySelector('code')?.className.match(/language-([\w-]+)/u)?.[1] ?? '')
  if (node.tagName === 'CODE') {
    const text = node.textContent
    const ticks = '`'.repeat(Math.max(1, ...(text.match(/`+/gu) ?? []).map(value => value.length + 1)))
    const padding = /^`|`$/u.test(text) || (/^ .* $/u.test(text) && text.trim() !== '') ? ' ' : ''
    return `${ticks}${padding}${text}${padding}${ticks}`
  }
  if (node.tagName === 'TABLE') {
    const rows = [...node.querySelectorAll('tr')].map(row => [...row.children]
      .filter(cell => cell.matches('th,td')).map(cell => [...cell.childNodes].map(markdown).join('').trim()
        .replaceAll('|', '\\|').replace(/\n+/gu, '<br>')))
    if (rows.length === 0) return ''
    const width = Math.max(...rows.map(row => row.length))
    const lines = rows.map(row => `| ${Array.from({ length: width }, (_, i) => row[i] ?? '').join(' | ')} |`)
    lines.splice(1, 0, `| ${Array.from({ length: width }, () => '---').join(' | ')} |`)
    return `\n\n${lines.join('\n')}\n\n`
  }
  if (node.tagName === 'UL' || node.tagName === 'OL') {
    const start = Number(node.getAttribute('start') ?? 1)
    return `\n${[...node.children].filter(child => child.tagName === 'LI').map((item, index) => {
      const marker = node.tagName === 'OL' ? `${String(start + index)}. ` : '- '
      const body = childrenMarkdown(item).trim()
      return marker + body.replaceAll('\n', '\n' + ' '.repeat(marker.length))
    }).join('\n')}\n\n`
  }
  if (node.tagName === 'INPUT' && node.getAttribute('type') === 'checkbox') {
    return node.hasAttribute('checked') ? '[x] ' : '[ ] '
  }
  const body = childrenMarkdown(node)
  const href = destination(node)
  if (href !== null && body !== '') return `[${body}](<${href.replace(/[<>\s]/gu, encodeURIComponent)}>)`
  if (node.tagName === 'BR') return '\n'
  if (node.tagName === 'HR') return '\n\n---\n\n'
  if (/^H[1-6]$/u.test(node.tagName)) return `${'#'.repeat(Number(node.tagName.slice(1)))} ${body}\n\n`
  if (node.tagName === 'STRONG') return `**${body}**`
  if (node.tagName === 'EM') return `*${body}*`
  if (node.tagName === 'DEL') return `~~${body}~~`
  if (node.tagName === 'BLOCKQUOTE') return `${body.trim().split('\n').map(line => `> ${line}`).join('\n')}\n\n`
  return BLOCKS.has(node.tagName) ? `${body}\n\n` : body
}
function childrenMarkdown(node: Node): string {
  return [...node.childNodes].map(markdown).reduce((text, next) =>
    text.endsWith('\n\n') ? text + next.replace(/^\n+/u, '') : text + next, '')
}
function fencedCode(node: Element, language: string): string {
  const text = node.textContent
  const ticks = '`'.repeat(Math.max(3, ...(text.match(/`+/gu) ?? []).map(value => value.length + 1)))
  return `\n\n${ticks}${language}\n${text}${text.endsWith('\n') ? '' : '\n'}${ticks}\n\n`
}
function elementOf(node: Node): Element | null { return node instanceof Element ? node : node.parentElement }

/**
 * Copy a selected rendered passage as Markdown, with formulas taken from TeX source.
 * Formula boundaries are atomic: selecting a subscript copies its complete formula once.
 * @param root - Markdown root containing the complete selection.
 * @param event - Native copy gesture.
 * @returns Whether Markdown copying handled this selection.
 */
export function copyLinkedSelection(root: HTMLElement, event: ClipboardEvent): boolean {
  if (event.clipboardData === null) return false
  const doc = root.ownerDocument
  const selection = doc.getSelection()
  if (selection === null || selection.isCollapsed || selection.rangeCount !== 1) return false
  const selected = selection.getRangeAt(0)
  if (!root.contains(selected.startContainer) || !root.contains(selected.endContainer)) return false
  const range = selected.cloneRange()
  const firstMath = elementOf(range.startContainer)?.closest(MATH)
  const lastMath = elementOf(range.endContainer)?.closest(MATH)
  if (firstMath !== null && firstMath !== undefined && root.contains(firstMath)) range.setStartBefore(firstMath)
  if (lastMath !== null && lastMath !== undefined && root.contains(lastMath)) range.setEndAfter(lastMath)
  // cloneContents omits common ancestors. Recover those wrappers so selections
  // wholly inside emphasis, a heading, a link or a quote keep their Markdown role.
  let fragment: Node = range.cloneContents()
  let ancestor = elementOf(range.commonAncestorContainer)
  while (ancestor !== null && ancestor !== root && root.contains(ancestor)) {
    const wrapper = ancestor.cloneNode(false)
    wrapper.appendChild(fragment)
    fragment = wrapper
    ancestor = ancestor.parentElement
  }
  const text = markdown(fragment).trim()
  if (text === '') return false
  event.clipboardData.clearData()
  event.clipboardData.setData('text/plain', text)
  event.clipboardData.setData('text/markdown', text)
  // A rendered HTML flavor wins over plain text in rich-text composers and
  // reintroduces math glyph duplication. Both clipboard flavors carry source.
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
