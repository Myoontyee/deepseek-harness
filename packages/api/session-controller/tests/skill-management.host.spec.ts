import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { expect, it, vi, onTestFinished } from 'vitest'
import { SkillManagement, skillArchive, skillRepository } from '../src/skill-management.ts'

const document = (body = 'First version') => `---\nname: sample-skill\ndescription: A test skill\n---\n${body}`
const archive = (body?: string) => Buffer.from(zipSync({ 'bundle/SKILL.md': strToU8(document(body)), 'bundle/scripts/example.txt': strToU8('asset') })).toString('base64')
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-management-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const changed = vi.fn()
  return { root, changed, manager: new SkillManagement(changed, join(root, 'dsh'), join(root, 'user')) }
}
it('rejects traversal and oversized expansion before extraction', () => {
  expect(() => skillRepository('https://evil.example/owner/repo')).toThrow()
  expect(skillRepository('https://github.com/owner/repo.git')).toBe('owner/repo')
  expect(() => skillArchive(zipSync({ '../escape/SKILL.md': strToU8(document()) }))).toThrow('path')
  expect(() => skillArchive(zipSync({ 'A.txt': strToU8('a'), 'a.txt': strToU8('b') }))).toThrow('Duplicate')
  expect(() => skillArchive(zipSync({ 'huge': new Uint8Array(21 * 1024 * 1024) }))).toThrow('limits')
})
it('installs assets, enables, disables, removes and restores without restarting', async () => {
  const { manager, root, changed } = await fixture()
  expect(manager.zipSkills(archive())).toMatchObject([{ name: 'sample-skill', path: 'bundle' }])
  expect(manager.previewZip(archive(), 'bundle')).toContain('First version')
  await manager.installZip(archive(), 'bundle')
  const [record] = (await manager.snapshot()).installed
  expect(record).toBeDefined()
  const path = join(root, 'dsh', 'skills', 'sample-skill', 'SKILL.md')
  expect(await readFile(path, 'utf8')).toContain('First version')
  await manager.manage(record!.id, 'disable')
  await expect(readFile(path)).rejects.toThrow()
  await manager.manage(record!.id, 'enable')
  expect(await readFile(path, 'utf8')).toContain('First version')
  await manager.manage(record!.id, 'remove')
  expect((await manager.snapshot()).installed[0]?.removed).toBe(true)
  await manager.manage(record!.id, 'restore')
  expect(await readFile(path, 'utf8')).toContain('First version')
  expect(changed).toHaveBeenCalledTimes(5)
})
it('backs up updates, restores prior content, and protects local edits', async () => {
  const { manager, root } = await fixture()
  await manager.installZip(archive(), 'bundle')
  await manager.installZip(archive('Second version'), 'bundle')
  const record = (await manager.snapshot()).installed[0]!
  const path = join(root, 'dsh', 'skills', 'sample-skill', 'SKILL.md')
  await manager.manage(record.id, 'restore')
  expect(await readFile(path, 'utf8')).toContain('First version')
  await manager.manage(record.id, 'restore')
  expect(await readFile(path, 'utf8')).toContain('Second version')
  await writeFile(path, document('Local edit'))
  await expect(manager.installZip(archive('Third'), 'bundle')).rejects.toThrow('edited')
  expect(await readFile(path, 'utf8')).toContain('Local edit')
})
it('imports a local skill without changing its source and refuses unmanaged collisions', async () => {
  const { manager, root } = await fixture()
  const source = join(root, 'user', '.codex', 'skills', 'sample-skill')
  await mkdir(source, { recursive: true }); await writeFile(join(source, 'SKILL.md'), document())
  expect((await manager.snapshot()).local).toMatchObject([{ id: 'codex:sample-skill' }])
  await manager.importLocal('codex:sample-skill')
  expect(await readFile(join(source, 'SKILL.md'), 'utf8')).toBe(document())
  await expect(manager.installZip(archive(), 'bundle')).rejects.toThrow('another source')
  const other = new SkillManagement(() => {}, join(root, 'other'), join(root, 'user'))
  const target = join(root, 'other', 'skills', 'sample-skill')
  await mkdir(target, { recursive: true }); await writeFile(join(target, 'SKILL.md'), document('Unmanaged'))
  await expect(other.installZip(archive(), 'bundle')).rejects.toThrow('unmanaged')
  expect(await readFile(join(target, 'SKILL.md'), 'utf8')).toContain('Unmanaged')
})
it('uses pinned GitHub content and the skills.sh search contract', async () => {
  const { manager } = await fixture()
  const sha = 'a'.repeat(40)
  const requested: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requested.push(url)
    if (url.startsWith('https://skills.sh/')) return Response.json({ skills: [{ source: 'owner/repo', skillId: 'sample-skill', name: 'Sample', installs: 8 }] })
    if (url.startsWith('https://api.github.com/')) return Response.json({ sha })
    return new Response(new Uint8Array(Buffer.from(archive(), 'base64')))
  }))
  onTestFinished(() => { vi.unstubAllGlobals() })
  expect(await manager.discover('sample', new AbortController().signal)).toMatchObject([{ repository: 'owner/repo', path: 'sample-skill' }])
  const found = await manager.repositorySkills('owner/repo', new AbortController().signal)
  expect(found[0]?.revision).toBe(sha)
  await manager.install({ repository: 'owner/repo', revision: sha, path: 'bundle' }, new AbortController().signal)
  expect(requested).toContain(`https://codeload.github.com/owner/repo/zip/${sha}`)
})

it('refreshes a running registry immediately even when filesystem watching is disabled', async () => {
  const { root } = await fixture()
  const ctx = new Context()
  const skills = ctx.plugin(SkillRegistry)
  await skills.await()
  const filesystem = ctx.plugin(SkillFilesystem, { includeDefaultRoots: false, customSkillDirs: [join(root, 'dsh', 'skills')], watch: false })
  await filesystem.await()
  onTestFinished(() => ctx.fiber.dispose())
  const manager = new SkillManagement(() => ctx.skills.refresh(), join(root, 'dsh'), join(root, 'user'))
  expect(await ctx.skills.list()).toHaveLength(0)
  await manager.installZip(archive(), 'bundle')
  expect(await ctx.skills.list()).toMatchObject([{ name: 'sample-skill' }])
  const record = (await manager.snapshot()).installed[0]!
  await manager.manage(record.id, 'disable')
  expect(await ctx.skills.list()).toHaveLength(0)
  await manager.manage(record.id, 'enable')
  expect(await ctx.skills.list()).toMatchObject([{ name: 'sample-skill' }])
})
