/** Device-code presentation and cancellation of real, managed login processes. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local'
import { expect, it, onTestFinished, vi } from 'vitest'
import { GithubSignIn } from '../src/auth.ts'

async function fixture() {
  const ctx = new Context()
  const root = await mkdtemp(join(tmpdir(), 'dsh-github-login-'))
  onTestFinished(async () => {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })
  await ctx.plugin(LocalSubprocess)
  const script = join(root, 'fake-gh.cjs')
  await writeFile(
    script,
    'process.stderr.write("First copy your one-time code: ABCD-1234\\nprivate-token-do-not-show\\n"); setTimeout(()=>{}, 20000)',
  )
  const spawn = ctx.subprocess.spawn.bind(ctx.subprocess)
  vi.spyOn(ctx.subprocess, 'resolveExecutable').mockResolvedValue(process.execPath)
  const calls = vi
    .spyOn(ctx.subprocess, 'spawn')
    .mockImplementation(spec => spawn({ ...spec, argv: [process.execPath, script] }))
  return { ctx, root, calls, auth: new GithubSignIn(ctx, 'gh', 15_000, 100) }
}

it('exposes only the device code and fixed URL, then joins the process on cancellation', async () => {
  const { root, auth, calls } = await fixture()
  const lifetime = new AbortController()
  const iterator = auth.login(root, lifetime.signal)[Symbol.asyncIterator]()
  expect((await iterator.next()).value).toEqual({ status: 'starting' })
  const waiting: unknown = (await iterator.next()).value
  expect(waiting).toEqual({ status: 'waiting', code: 'ABCD-1234', url: 'https://github.com/login/device' })
  expect(JSON.stringify(waiting)).not.toContain('private-token')
  expect(calls.mock.calls[0]?.[0].env?.GH_BROWSER).toBe(process.platform === 'win32' ? 'cmd /c exit 0' : 'true')
  lifetime.abort()
  expect((await iterator.next()).done).toBe(true)
  const next = auth.login(root, new AbortController().signal)[Symbol.asyncIterator]()
  expect((await next.next()).value).toEqual({ status: 'starting' })
  await next.return?.()
}, 20_000)

it('disposes a process even while its progress consumer is paused at a yielded code', async () => {
  const { ctx, root, auth } = await fixture()
  const iterator = auth.login(root, new AbortController().signal)[Symbol.asyncIterator]()
  await iterator.next()
  expect(await iterator.next()).toMatchObject({ done: false, value: { status: 'waiting' } })
  await ctx.fiber.dispose()
  expect((await iterator.next()).done).toBe(true)
}, 20_000)

it('refuses a concurrent login until the first stream is closed', async () => {
  const { root, auth } = await fixture()
  const first = auth.login(root, new AbortController().signal)[Symbol.asyncIterator]()
  await first.next()
  const second = auth.login(root, new AbortController().signal)[Symbol.asyncIterator]()
  await expect(second.next()).rejects.toThrow('already in progress')
  await first.return?.()
}, 20_000)
