/** Bounded OpenSSH discovery without publishing key or proxy contents. */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, onTestFinished } from 'vitest'
import { discoverSshConfigHosts, discoveredSshServerId } from '../src/ssh-config.ts'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-ssh-config-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  return root
}
it('discovers concrete aliases through Includes while excluding wildcard and negated hosts', async () => {
  const root = await fixture()
  await mkdir(join(root, 'includes'))
  await writeFile(
    join(root, 'config'),
    'Host gpu other !excluded *.example\n  HostName gpu.invalid\n  IdentityFile secret-key\nInclude "includes/*.conf"\n',
  )
  await writeFile(join(root, 'includes', 'extra.conf'), 'Host development\n  User tester\n  Port 2222\n')
  const result = await discoverSshConfigHosts([join(root, 'config')], { maxFiles: 4, maxBytes: 4096 })
  expect(result.hosts.map(host => host.sshTarget)).toEqual(['development', 'gpu', 'other'])
  expect(JSON.stringify(result.hosts)).not.toContain('secret-key')
  expect(result.errors).toEqual([])
  expect(discoveredSshServerId('gpu')).toMatch(/^ssh-config-[a-f0-9]{20}$/)
})
it('terminates Include cycles and reports file/byte limits instead of partial oversized config', async () => {
  const root = await fixture()
  await writeFile(join(root, 'config'), 'Include second\nHost first\n')
  await writeFile(join(root, 'second'), 'Include config\nHost second\n')
  expect((await discoverSshConfigHosts([join(root, 'config')], { maxFiles: 4, maxBytes: 4096 })).files).toHaveLength(2)
  const limited = await discoverSshConfigHosts([join(root, 'config')], { maxFiles: 1, maxBytes: 4096 })
  expect(limited.errors.join()).toContain('file limit')
  const bytes = await discoverSshConfigHosts([join(root, 'config')], { maxFiles: 4, maxBytes: 5 })
  expect(bytes.hosts).toEqual([])
  expect(bytes.errors.join()).toContain('byte limit')
})
it('keeps optional missing default configuration quiet and retains Unicode paths', async () => {
  const root = await fixture()
  await writeFile(join(root, '中文 配置'), '\ufeffHost writing # comment\n  HostName=writer.invalid\n')
  const result = await discoverSshConfigHosts([join(root, 'missing'), join(root, '中文 配置')], { maxFiles: 4, maxBytes: 4096 })
  expect(result.hosts[0]?.sshTarget).toBe('writing')
  expect(result.errors).toEqual([])
})
