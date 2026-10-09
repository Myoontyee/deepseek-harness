/** Content-only clipboard projection, retaining TeX and Markdown table structure. */
import { parseGfmWithMath } from './parse.ts'

interface CopyNode {
  type: string
  value?: string | undefined
  alt?: string | null | undefined
  lang?: string | null | undefined
  identifier?: string | undefined
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

function content(node: CopyNode): string {
  const children = (): string[] => node.children?.map(content) ?? []
  switch (node.type) {
    case 'root':
    case 'blockquote':
    case 'listItem':
    case 'footnoteDefinition': return children().filter(value => value !== '').join('\n\n')
    case 'list': return children().join('\n')
    case 'text':
    case 'inlineCode':
    case 'html': return node.value ?? ''
    case 'code': return node.lang?.match(/^[\w-]+/u)?.[0] === 'math' ? clipboardMath(node.value ?? '', true) : node.value ?? ''
    case 'math': return clipboardMath(node.value ?? '', true)
    case 'inlineMath': return clipboardMath(node.value ?? '', false)
    case 'image':
    case 'imageReference': return node.alt ?? ''
    case 'footnoteReference': return node.identifier ?? ''
    case 'break': return '\n'
    case 'definition':
    case 'thematicBreak': return ''
    case 'table': return clipboardTable((node.children ?? []).map(row => (row.children ?? []).map(content)))
    // Formatting and link wrappers contribute only their visible children.
    default: return children().join('')
  }
}

/**
 * Copy rendered message content without presentation markers or link destinations.
 * TeX, tables, code whitespace and literal HTML remain text; no rich clipboard payload is produced.
 * @param source - Complete Markdown message source, independent of collapsed or virtualized DOM.
 * @returns Plain clipboard text with TeX and Markdown tables retained.
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
  let text = content(parseGfmWithMath(protectedSource))
  equations.forEach((equation, index) => { text = text.replaceAll(`${prefix}${index}\uE001`, equation) })
  return text
}
