/** Explicit user file operations on verified local workspace paths. */
import { constants } from 'node:fs'
import { cp, lstat, mkdir, open, readdir, readFile, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import trash from 'trash'

import type { FileEntryChange } from './types.ts'

function within(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}
async function absent(path: string): Promise<void> {
  try { await lstat(path) } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
  throw new Error('FILE_ENTRY_EXISTS')
}
async function checked(root: string, path: string, existing: boolean): Promise<string> {
  const target = resolve(root, path)
  if (!within(root, target) || relative(root, target) === '') throw new Error('FILE_ENTRY_OUTSIDE_WORKSPACE')
  const parent = await realpath(dirname(target))
  if (!within(root, parent)) throw new Error('FILE_ENTRY_OUTSIDE_WORKSPACE')
  const result = join(parent, basename(target))
  if (existing) {
    const info = await lstat(result)
    if (info.isSymbolicLink()) throw new Error('FILE_ENTRY_LINK')
    if (!within(root, await realpath(result))) throw new Error('FILE_ENTRY_OUTSIDE_WORKSPACE')
  }
  return result
}

/**
 * Apply one explicit user mutation without overwriting an existing destination.
 * @param workspace - Verified local workspace directory.
 * @param request - User-selected source, operation and destination.
 * @param signal - Cancellation before the filesystem mutation is admitted.
 * @returns The resulting path, or the recycled source path.
 */
export async function changeFileEntry(workspace: string, request: FileEntryChange, signal: AbortSignal): Promise<string> {
  const root = await realpath(workspace)
  const creating = request.operation === 'new-file' || request.operation === 'new-folder'
  const source = await checked(root, request.path, !creating)
  signal.throwIfAborted()
  if (request.operation === 'new-file') {
    const file = await open(source, 'wx'); await file.close(); return source
  }
  if (request.operation === 'new-folder') { await mkdir(source); return source }
  if (request.operation === 'trash') { await trash(source, { glob: false }); return source }
  if (request.destination === undefined) throw new Error('FILE_ENTRY_DESTINATION_REQUIRED')
  const destination = await checked(root, request.destination, false)
  if (within(source, destination)) throw new Error('FILE_ENTRY_NESTED_DESTINATION')
  await absent(destination)
  signal.throwIfAborted()
  if (request.operation === 'rename' || request.operation === 'move') {
    await rename(source, destination); return destination
  }
  if (request.operation !== 'copy') throw new Error('FILE_ENTRY_UNKNOWN_OPERATION')
  const staging = join(dirname(destination), '.dsh-copy-' + randomUUID())
  try {
    await cp(source, staging, { recursive: true, force: false, errorOnExist: true, mode: constants.COPYFILE_EXCL,
      filter: async (path) => {
        signal.throwIfAborted()
        if ((await lstat(path)).isSymbolicLink()) throw new Error('FILE_ENTRY_LINK')
        return true
      } })
    signal.throwIfAborted()
    await absent(destination)
    await rename(staging, destination)
    return destination
  } finally {
    // Only this operation's randomly named staging entry is eligible for cleanup.
    if (dirname(staging) !== dirname(destination) || !basename(staging).startsWith('.dsh-copy-')) throw new Error('Invalid staging path')
    await rm(staging, { recursive: true, force: true })
  }
}

/**
 * Search a bounded set of regular files without following links.
 * @param workspace - Verified local workspace directory.
 * @param directory - Directory selected by the user.
 * @param query - Literal case-insensitive search text.
 * @param content - Search UTF-8 text contents instead of names.
 * @param maxEntries - Maximum files and matches to inspect or return.
 * @param maxBytes - Maximum bytes read from one text file.
 * @param signal - Caller cancellation.
 * @returns Matching paths and optional lines, with explicit truncation.
 */
export async function searchFileEntries(
  workspace: string, directory: string, query: string, content: boolean,
  maxEntries: number, maxBytes: number, signal: AbortSignal,
): Promise<{ matches: Array<{ path: string; line: number; text: string }>; truncated: boolean }> {
  const root = await realpath(workspace)
  const start = await realpath(resolve(root, directory))
  if (!within(root, start)) throw new Error('FILE_ENTRY_OUTSIDE_WORKSPACE')
  if (query.trim() === '' || query.length > 200) throw new Error('FILE_ENTRY_QUERY_REQUIRED')
  const matches: Array<{ path: string; line: number; text: string }> = []
  const needle = query.toLowerCase()
  let visited = 0; let truncated = false
  async function visit(folder: string): Promise<void> {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      signal.throwIfAborted()
      if (visited >= maxEntries || matches.length >= maxEntries) { truncated = true; return }
      if (entry.isSymbolicLink() || ['.git', 'node_modules', '.desktop-build'].includes(entry.name)) continue
      const path = join(folder, entry.name)
      visited++
      if (!content && entry.name.toLowerCase().includes(needle)) matches.push({ path, line: 0, text: entry.name })
      if (entry.isDirectory()) await visit(path)
      else if (content && entry.isFile()) {
        const info = await lstat(path)
        if (info.size > maxBytes) continue
        const data = await readFile(path)
        if (data.includes(0)) continue
        for (const [index, text] of data.toString('utf8').split(/\r?\n/u).entries()) {
          if (text.toLowerCase().includes(needle)) matches.push({ path, line: index + 1, text: text.slice(0, 300) })
          if (matches.length >= maxEntries) { truncated = true; return }
        }
      }
    }
  }
  await visit(start)
  return { matches, truncated }
}
