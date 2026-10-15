/** Content-only clipboard projection, retaining Markdown links, TeX and table structure. */
import katex from 'katex'
import { parseGfmWithMath } from './parse.ts'

interface CopyNode {
  type: string
  value?: string | undefined
  alt?: string | null | undefined
  lang?: string | null | undefined
  identifier?: string | undefined
  url?: string | undefined
  children?: CopyNode[] | undefined
}

/**
 * Wrap TeX in inline or display delimiters.
 * @param source - Original TeX.
 * @param display - Block rather than inline math.
 * @returns Copyable TeX with delimiters.
 */
export function clipboardMath(source: string, display: boolean): string {
  return display ? `$$\n${source.trim()}\n$$` : `$${source}$`
}

/**
 * Preserve table cell boundaries without inline styling.
 * @param rows - Cell contents without presentation markup.
 * @returns A rectangular Markdown table.
 */
export function clipboardTable(rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return ''
  const width = Math.max(...rows.map(row => row.length))
  const lines = rows.map(row => `| ${Array.from({ length: width }, (_, i) =>
    (row[i] ?? '').trim().replaceAll('|', '\\|').replace(/\n+/gu, '<br>')).join(' | ')} |`)
  lines.splice(1, 0, `| ${Array.from({ length: width }, () => '---').join(' | ')} |`)
  return lines.join('\n')
}

/**
 * Preserve a link as portable Markdown without styling its label.
 * @param label - Visible, unstyled link text.
 * @param destination - Link destination, including local file paths.
 * @returns Markdown link text, or only the label for an unsafe scheme.
 */
export function clipboardLink(label: string, destination: string): string {
  const target = destination.trim()
  const scheme = /^([a-z][a-z\d+.-]*):/iu.exec(target)?.[1]?.toLowerCase()
  if (!target || /[\u0000-\u001f\u007f]/u.test(target)
    || (scheme !== undefined && !['http', 'https', 'mailto', 'file'].includes(scheme) && !/^[a-z]:[\\/]/iu.test(target))) return label
  const escaped = label.replace(/[\\`*_[\]<>]/gu, '\\$&')
  const url = target.replaceAll('\\', '/').replaceAll('<', '%3C').replaceAll('>', '%3E').replaceAll(' ', '%20')
  return `[${escaped}](<${url}>)`
}

function linkDefinitions(root: CopyNode): ReadonlyMap<string, string> {
  const definitions = new Map<string, string>()
  const visit = (node: CopyNode): void => {
    if (node.type === 'definition' && node.identifier !== undefined && node.url !== undefined) {
      const id = node.identifier.toUpperCase()
      if (!definitions.has(id)) definitions.set(id, node.url)
    }
    node.children?.forEach(visit)
  }
  visit(root)
  return definitions
}

function content(node: CopyNode, plain = false, definitions?: ReadonlyMap<string, string>): string {
  const children = (): string[] => node.children?.map(child => content(child, plain, definitions)) ?? []
  switch (node.type) {
    case 'root':
    case 'blockquote':
    case 'listItem':
    case 'footnoteDefinition': return children().filter(value => value !== '').join('\n\n')
    case 'list': return children().join('\n')
    case 'text':
    case 'inlineCode':
    case 'html': return plain && node.type === 'html' ? new DOMParser().parseFromString(node.value ?? '', 'text/html').body.textContent ?? '' : node.value ?? ''
    case 'code': return node.lang?.match(/^[\w-]+/u)?.[0] === 'math' ? (plain ? plainMath(node.value ?? '') : clipboardMath(node.value ?? '', true)) : node.value ?? ''
    case 'math': return (plain ? plainMath(node.value ?? '') : clipboardMath(node.value ?? '', true))
    case 'inlineMath': return (plain ? plainMath(node.value ?? '') : clipboardMath(node.value ?? '', false))
    case 'link':
    case 'linkReference': {
      const label = children().join('')
      const destination = node.url ?? definitions?.get(node.identifier?.toUpperCase() ?? '')
      return plain || destination === undefined ? label : clipboardLink(label, destination)
    }
    case 'image':
    case 'imageReference': return node.alt ?? ''
    case 'footnoteReference': return node.identifier ?? ''
    case 'break': return '\n'
    case 'definition':
    case 'thematicBreak': return ''
    case 'table': {
      const rows = (node.children ?? []).map(row => (row.children ?? []).map(cell => content(cell, plain, definitions)))
      return plain ? rows.map(row => row.join('\t')).join('\n') : clipboardTable(rows)
    }
    // Styling wrappers contribute only their visible children.
    default: return children().join('')
  }
}

/**
 * Copy rendered message content without styling markers, retaining Markdown links.
 * TeX, tables, code whitespace and literal HTML remain text; no rich clipboard payload is produced.
 * @param source - Complete Markdown message source, independent of collapsed or virtualized DOM.
 * @returns Plain clipboard text with links, TeX and Markdown tables retained.
 */
export function markdownClipboardText(source: string): string {
  // Literal equation environments are also copied intact when not rendered by KaTeX.
  let prefix = '\uE000dsh-copy-tex'
  while (source.includes(prefix)) prefix += '_'
  const equations: string[] = []
  const protectedSource = source.replace(/\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}/gu, (equation) => {
    const token = `${prefix}${equations.length}\uE001`
    equations.push(equation)
    return token
  })
  const root = parseGfmWithMath(protectedSource)
  let text = content(root, false, linkDefinitions(root))
  equations.forEach((equation, index) => { text = text.replaceAll(`${prefix}${index}\uE001`, equation) })
  return text
}

/** Flatten one MathML presentation tree, never the duplicate HTML or TeX annotation. */
function mathText(node: Element): string {
  const children = Array.from(node.children).map(mathText)
  switch (node.localName) {
    case 'annotation': case 'annotation-xml': return ''
    case 'mfrac': return `(${children[0] ?? ''})/(${children[1] ?? ''})`
    case 'msub': return `${children[0] ?? ''}_${children[1] ?? ''}`
    case 'msup': return `${children[0] ?? ''}^(${children[1] ?? ''})`
    case 'msubsup': return `${children[0] ?? ''}_${children[1] ?? ''}^(${children[2] ?? ''})`
    case 'msqrt': return `sqrt(${children.join('')})`
    case 'mroot': return `root(${children[1] ?? ''}, ${children[0] ?? ''})`
    case 'mtable': return children.join('\n')
    case 'mtr': return children.join('\t')
    case 'mspace': return ' '
    default: return children.length > 0 ? children.join('') : node.textContent ?? ''
  }
}

function plainMath(source: string): string {
  try {
    const markup = katex.renderToString(source.replace(/\\label\{[^}]*\}/gu, ''), { output: 'mathml', displayMode: true, throwOnError: true, trust: false, strict: 'ignore' })
    const math = new DOMParser().parseFromString(markup, 'text/html').querySelector('math')
    return math === null ? source : mathText(math).trim()
  } catch {
    // Unsupported TeX stays legible and intact rather than silently losing content.
    return source
  }
}

/**
 * Strip Markdown presentation for explicit paste-as-text, including math and tables.
 * @param source - Clipboard text from DSH or another application.
 * @returns Linear math, tab-separated table cells and unstyled content.
 */
export function clipboardPlainText(source: string): string {
  let prefix = '\uE000dsh-plain-tex'
  while (source.includes(prefix)) prefix += '_'
  const equations: string[] = []
  const protectedSource = source.replace(/\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}/gu, (equation) => {
    const token = `${prefix}${equations.length}\uE001`
    equations.push(plainMath(equation))
    return token
  })
  let text = content(parseGfmWithMath(protectedSource), true)
  equations.forEach((equation, index) => { text = text.replaceAll(`${prefix}${index}\uE001`, equation) })
  return text
}
