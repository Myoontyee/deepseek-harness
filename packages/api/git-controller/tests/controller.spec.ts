/** Real Git repository mutations, Unicode paths, stale index fences and non-destructive branches. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, readFile, rm, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local'
import type { WorkspaceRegistry, Workspace } from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { expect, it, onTestFinished } from 'vitest'
import { GitController } from '../src/index.ts'
import { completeOutput } from '../src/commands.ts'
import { literalPath, parseStatus } from '../src/parse.ts'

const execute = promisify(execFile)
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-git-ui-'))
  const ctx = new Context()
  onTestFinished(async () => {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })
  await ctx.plugin(LocalSubprocess)
  const id = 'test-workspace' as WorkspaceId
  const workspace = { id, path: root, title: 'Test repository' } as Workspace
  // The controller consumes only registry lookup and listing; storage is covered by its owner.
  ctx.provide('workspaceRegistry', {
    get: (key: WorkspaceId) => (key === id ? workspace : undefined),
    list: () => [workspace],
  } as WorkspaceRegistry)
  const controller = new GitController(ctx, GitController.Config({ timeoutMs: 10_000 }))
  const git = (...args: string[]) => execute('git', args, { cwd: root, encoding: 'utf8' })
  await git('init', '-b', 'main')
  await git('config', 'user.name', 'DSH fixture')
  await git('config', 'user.email', 'fixture@example.invalid')
  await git('config', 'core.hooksPath', join(root, 'no-hooks'))
  await git('config', 'commit.gpgsign', 'false')
  return { root, controller, id, git }
}

it('stages and unstages a Unicode filename in an unborn repository without deleting it', async () => {
  const { root, controller, id } = await fixture()
  const path = '写作 交接.md'
  await writeFile(join(root, path), '原始内容\n')
  const initial = await controller.status(id)
  expect(initial.head).toBeNull()
  expect(initial.merging).toBe(false)
  expect(initial.changes[0]?.path).toBe(path)
  const staged = await controller.stage(id, [path], initial.revision)
  expect(staged.result.exitCode).toBe(0)
  expect(staged.status.changes[0]?.index).toBe('A')
  const unstaged = await controller.unstage(id, [path], staged.status.revision)
  expect(unstaged.result.exitCode).toBe(0)
  expect(await readFile(join(root, path), 'utf8')).toBe('原始内容\n')
  expect(unstaged.status.changes[0]?.index).toBe('?')
}, 30_000)

it('commits only the reviewed index, retains unstaged content, and refuses stale retries', async () => {
  const { root, controller, id } = await fixture()
  await writeFile(join(root, 'a.txt'), 'staged\n')
  const staged = await controller.stage(id, ['a.txt'], (await controller.status(id)).revision)
  await writeFile(join(root, 'a.txt'), 'unstaged\n')
  const state = await controller.status(id)
  const committed = await controller.commit(id, 'first commit', state.revision)
  expect(committed.result.exitCode).toBe(0)
  expect(committed.status.changes[0]?.worktree).toBe('M')
  expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('unstaged\n')
  await expect(controller.commit(id, 'duplicate', state.revision)).rejects.toThrow('Repository changed')
  await expect(controller.commit(id, 'stale stage', staged.status.revision)).rejects.toThrow('Repository changed')
  expect((await controller.history(id)).map(item => item.subject)).toEqual(['first commit'])
}, 30_000)

it('checks index blob identities even when porcelain status does not change', async () => {
  const { root, controller, id, git } = await fixture()
  await writeFile(join(root, 'a.txt'), 'one\n')
  const staged = await controller.stage(id, ['a.txt'], (await controller.status(id)).revision)
  await writeFile(join(root, 'a.txt'), 'two\n')
  await git('add', '--', 'a.txt')
  await expect(controller.commit(id, 'stale index', staged.status.revision)).rejects.toThrow('Repository changed')
}, 30_000)

it('uses the saved branch prefix and preserves working changes when switching', async () => {
  const { root, controller, id } = await fixture()
  await writeFile(join(root, 'a.txt'), 'one\n')
  let state = (await controller.stage(id, ['a.txt'], (await controller.status(id)).revision)).status
  state = (await controller.commit(id, 'first', state.revision)).status
  await writeFile(join(root, 'a.txt'), 'local work\n')
  state = await controller.status(id)
  const switched = await controller.switchBranch(id, 'review', true, state.revision)
  expect(switched.result.exitCode).toBe(0)
  expect(switched.status.branch).toBe('dsh/review')
  expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('local work\n')
  expect((await controller.branches(id)).find(branch => branch.current)?.name).toBe('dsh/review')
}, 30_000)

it('handles staged renames with spaces and unstages both source and destination', async () => {
  const { root, controller, id, git } = await fixture()
  await writeFile(join(root, 'old file.txt'), 'same contents\n')
  await git('add', '.')
  await git('commit', '-m', 'initial')
  await rename(join(root, 'old file.txt'), join(root, 'new 文件.txt'))
  await git('add', '-A')
  const state = await controller.status(id)
  expect(state.changes).toHaveLength(1)
  expect(state.changes[0]).toMatchObject({ path: 'new 文件.txt', originalPath: 'old file.txt', index: 'R' })
  const result = await controller.unstage(id, ['new 文件.txt'], state.revision)
  expect(result.result.exitCode).toBe(0)
  expect(await readFile(join(root, 'new 文件.txt'), 'utf8')).toBe('same contents\n')
}, 30_000)

it('treats option-shaped filenames literally and rejects unregistered workspaces', async () => {
  const { root, controller, id } = await fixture()
  await writeFile(join(root, '--all'), 'literal file\n')
  const state = await controller.status(id)
  expect((await controller.stage(id, ['--all'], state.revision)).result.exitCode).toBe(0)
  await expect(controller.status('missing' as WorkspaceId)).rejects.toThrow('Workspace is no longer available')
  expect(controller.workspaces().map(w => w.id)).toEqual([id])
}, 30_000)

it('decodes branch divergence and rejects malformed rename output', () => {
  expect(parseStatus('## main...origin/main [ahead 2, behind 3]\0 M a b.txt\0')).toMatchObject({
    branch: 'main',
    upstream: 'origin/main',
    ahead: 2,
    behind: 3,
  })
  expect(() => parseStatus('## main\0R  new\0')).toThrow('Missing Git rename source')
  for (const path of ['../outside', '/root', 'C:\\outside', 'x/../secret', '']) expect(() => literalPath(path)).toThrow()
}, 30_000)

it('never reports a killed, timed-out or truncated command as a successful read', () => {
  const result = { stdout: 'tail', stderr: '', exitCode: 0, timedOut: false, truncated: false }
  expect(() => completeOutput({ ...result, exitCode: null })).toThrow('did not complete')
  expect(() => completeOutput({ ...result, timedOut: true })).toThrow('timed out')
  expect(() => completeOutput({ ...result, truncated: true })).toThrow('size limit')
}, 30_000)
