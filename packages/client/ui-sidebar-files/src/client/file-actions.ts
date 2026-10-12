/** File gestures shared by the tree and document toolbar. */
export interface FileActions {
  notify(text: string): void
  change(request: {
    operation: 'new-file' | 'new-folder' | 'rename' | 'copy' | 'move' | 'trash'
    path: string
    destination?: string
  }): Promise<string>
  search(directory: string, query: string, content: boolean): Promise<{
    matches: Array<{ path: string; line: number; text: string }>
    truncated: boolean
  }>
  reveal(path: string): Promise<void>
  open(path: string, line?: number): void
  locate(path: string): void
  add(path: string, directory: boolean): void
  terminal(path: string): Promise<void>
  clipboard(): { path: string; cut: boolean } | undefined
  remember(path: string, cut: boolean): void
  clearClipboard(): void
}

/**
 * Return a slash-separated path relative to the workspace, preserving filename case.
 * @param root - Session workspace root.
 * @param path - Selected absolute path.
 * @returns Relative path inside the workspace, otherwise the original path.
 */
export function relativeFilePath(root: string, path: string): string {
  const base = root.replace(/\\/gu, '/').replace(/\/+$/u, '')
  const target = path.replace(/\\/gu, '/').replace(/\/+$/u, '')
  const insensitive = /^[A-Za-z]:/u.test(base)
  const compare = (value: string): string => insensitive ? value.toLowerCase() : value
  if (compare(base) === compare(target)) return '.'
  if (compare(target).startsWith(compare(base) + '/')) return target.slice(base.length + 1)
  return path
}

/**
 * Parent path without dropping the root separator of a drive.
 * @param path - Selected absolute path.
 * @returns Its containing directory.
 */
export function parentFilePath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/u, '')
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return trimmed.slice(0, index === 2 && trimmed[1] === ':' ? 3 : Math.max(index, 1))
}

/**
 * Final path segment for dialogs and references.
 * @param path - Selected absolute path.
 * @returns Filename or directory name.
 */
export function fileName(path: string): string { return path.replace(/[\\/]+$/u, '').split(/[\\/]/u).at(-1) ?? path }
