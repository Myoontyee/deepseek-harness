/** Parsers for Git's machine-readable output; paths are never shell-unquoted. */
import type { GitChange } from './types.ts'

/**
 * Decode porcelain v1 with `--branch -z`, including rename source records.
 * @param output - complete, non-truncated Git output.
 * @returns branch facts and changed paths.
 */
export function parseStatus(output: string): {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  changes: GitChange[]
} {
  const fields = output.split('\0')
  const header = fields.shift()
  if (!header?.startsWith('## ')) throw new Error('Git status did not return a branch header')
  const label = header.slice(3).replace(/ \[.*\]$/, '')
  const separator = label.indexOf('...')
  const branch = label.startsWith('HEAD (')
    ? null
    : (label.replace(/^(?:No commits yet on |Initial commit on )/, '').split('...')[0] ?? null)
  const changes: GitChange[] = []
  const conflicts = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    if (field === '') continue
    if (!field || field.length < 4 || field[2] !== ' ') throw new Error('Invalid Git status record')
    const index = field.charAt(0)
    const worktree = field.charAt(1)
    const path = field.slice(3)
    const renamed = index === 'R' || index === 'C' || worktree === 'R' || worktree === 'C'
    const originalPath = renamed ? fields[++i] : undefined
    if (renamed && !originalPath) throw new Error('Missing Git rename source')
    changes.push({
      path,
      index,
      worktree,
      conflict: conflicts.has(index + worktree),
      ...(originalPath === undefined ? {} : { originalPath }),
    })
  }
  return {
    branch,
    upstream: separator < 0 ? null : label.slice(separator + 3),
    ahead: Number(/ahead (\d+)/.exec(header)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(header)?.[1] ?? 0),
    changes,
  }
}

/**
 * Reject absolute paths, traversal and pathspec magic before passing a literal path.
 * @param path - repository-relative selected file.
 * @returns accepted unchanged path.
 */
export function literalPath(path: string): string {
  if (
    !path ||
    path.length > 32768 ||
    /[\0\r\n]/.test(path) ||
    /^[\\/]|^[A-Za-z]:/.test(path) ||
    path.split(/[\\/]/).includes('..')
  ) {
    throw new Error('Select a file inside the repository')
  }
  return path
}
