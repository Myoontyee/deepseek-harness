/** Real filesystem regression coverage for explicit file-tree mutations. */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { changeFileEntry, searchFileEntries } from '../src/file-operations.ts'

const owned: string[] = []
const signal = new AbortController().signal
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-file-operations-'))
  owned.push(root)
  return root
}
afterEach(async () => {
  for (const root of owned.splice(0)) {
    const path = resolve(root)
    if (!path.startsWith(resolve(tmpdir()) + sep) || !path.split(sep).at(-1)?.startsWith('dsh-file-operations-')) throw new Error('Unsafe cleanup target')
    await rm(path, { recursive: true, force: true })
  }
})
describe('file actions', () => {
  it('creates, copies, renames and moves Chinese paths without overwriting', async () => {
    const root = await fixture()
    await changeFileEntry(root, { operation: 'new-folder', path: '资料' }, signal)
    await changeFileEntry(root, { operation: 'new-file', path: '资料/原文.txt' }, signal)
    await writeFile(join(root, '资料/原文.txt'), '中文 \\mu_D', 'utf8')
    await changeFileEntry(root, { operation: 'copy', path: '资料', destination: '副本' }, signal)
    expect(await readFile(join(root, '副本/原文.txt'), 'utf8')).toBe('中文 \\mu_D')
    await expect(changeFileEntry(root, { operation: 'copy', path: '资料', destination: '副本' }, signal)).rejects.toThrow('FILE_ENTRY_EXISTS')
    await changeFileEntry(root, { operation: 'rename', path: '副本', destination: '重命名' }, signal)
    await changeFileEntry(root, { operation: 'move', path: '重命名/原文.txt', destination: '移出.txt' }, signal)
    expect(await readFile(join(root, '移出.txt'), 'utf8')).toBe('中文 \\mu_D')
    expect((await readdir(root)).some(name => name.startsWith('.dsh-copy-'))).toBe(false)
  })
  it('rejects workspace roots, parent escapes, nested copies and links', async () => {
    const root = await fixture(); const outside = await fixture()
    await mkdir(join(root, 'folder'))
    await symlink(outside, join(root, 'link'), 'junction')
    await expect(changeFileEntry(root, { operation: 'trash', path: root }, signal)).rejects.toThrow('OUTSIDE_WORKSPACE')
    await expect(changeFileEntry(root, { operation: 'new-file', path: '../escape' }, signal)).rejects.toThrow('OUTSIDE_WORKSPACE')
    await expect(changeFileEntry(root, { operation: 'new-file', path: 'link/escape' }, signal)).rejects.toThrow('OUTSIDE_WORKSPACE')
    await expect(changeFileEntry(root, { operation: 'copy', path: 'link', destination: 'copy' }, signal)).rejects.toThrow('FILE_ENTRY_LINK')
    await expect(changeFileEntry(root, { operation: 'copy', path: 'folder', destination: 'folder/copy' }, signal)).rejects.toThrow('NESTED_DESTINATION')
    expect(await readdir(outside)).toEqual([])
  })
  it('searches bounded text, excludes binary files and observes cancellation', async () => {
    const root = await fixture()
    await writeFile(join(root, '论文.txt'), '第一行\nneedle中文\nneedle')
    await writeFile(join(root, 'binary'), Buffer.from([0, 110, 101, 101, 100, 108, 101]))
    const found = await searchFileEntries(root, root, 'needle', true, 100, 4096, signal)
    expect(found.matches.map(match => match.line)).toEqual([2, 3])
    expect((await searchFileEntries(root, root, '论文', false, 100, 4096, signal)).matches).toHaveLength(1)
    const abort = new AbortController(); abort.abort()
    await expect(changeFileEntry(root, { operation: 'new-file', path: 'cancelled' }, abort.signal)).rejects.toThrow()
  })
})
