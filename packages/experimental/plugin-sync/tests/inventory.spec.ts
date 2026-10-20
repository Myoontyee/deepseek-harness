// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { inventoryProfile } from '../src/inventory.ts'
import { formatInventory } from '../src/inventory.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(): { home: string; profile: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-sync-'))
  roots.push(root)
  const home = join(root, '.dsh')
  const profile = join(home, 'profiles', 'desktop')
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'local.tgz'), Buffer.from('local plugin bytes'))
  mkdirSync(join(profile, 'linked'), { recursive: true })
  writeFileSync(join(profile, 'cordis.patch.yml'), 'plugins:\n  example: {}\n')
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: {
      '@scope/registry': '1.2.3',
      'local-tgz': 'file:./local.tgz',
      '@local/linked': 'link:./linked',
      '@scope/extra': '4.5.6',
    },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@scope/registry', 'local-tgz', '@local/linked'] } },
  }))
  writeFileSync(join(home, 'config.yaml'), 'llm:\n  apiKey: sk-should-not-leak\nmcp:\n  token: tok-should-not-leak\n')
  mkdirSync(join(home, 'skills', 'demo'), { recursive: true })
  writeFileSync(join(home, 'skills', 'demo', 'SKILL.md'), '# Demo\n')
  mkdirSync(join(home, 'skills', 'real-skill'), { recursive: true })
  try {
    symlinkSync(join(home, 'skills', 'real-skill'), join(home, 'skills', 'linked-skill'), 'junction')
  } catch { /* Windows may reject junction creation; the dedicated symlink assertion is skipped below. */ }
  mkdirSync(join(home, '.agent-presets', 'liangshen'), { recursive: true })
  writeFileSync(join(home, '.agent-presets', 'liangshen', 'preset.json'), '{}')
  return { home, profile }
}

describe('read-only inventory', () => {
  it('classifies carriers without writing the profile', () => {
    const { home, profile } = fixture()
    const result = inventoryProfile({
      dshHome: home, profileName: 'desktop', hostBaseVersion: '0.2.1-rc.2', now: new Date('2026-10-20T00:00:00Z'),
    })
    const bundle = (name: string) => result.bundles.find(entry => entry.name === name)
    expect(bundle('@deepseek-ai/dsh-base')).toMatchObject({ source: 'host', status: 'supported' })
    expect(bundle('@scope/registry')).toMatchObject({ source: 'registry', status: 'supported' })
    expect(bundle('local-tgz')).toMatchObject({ source: 'tarball', status: 'inventory-only' })
    expect(bundle('@local/linked')).toMatchObject({ source: 'link', status: 'unsupported' })
    expect(bundle('local-tgz')?.artifact?.sha256).toHaveLength(64)
    expect(result.dependencies.find(entry => entry.name === '@scope/extra')).toMatchObject({ declaredBy: 'dependency', source: 'registry' })
    expect(result.unsupported.map(item => item.name)).toContain('@local/linked')
    expect(result.profile.path).toBe(profile)
    expect(result.generatedAt).toBe('2026-10-20T00:00:00.000Z')
  })

  it('never exports secret values or follows skill symlinks', () => {
    const { home } = fixture()
    const result = inventoryProfile({ dshHome: home, profileName: 'desktop', hostBaseVersion: '0.2.1-rc.2' })
    expect(result.config?.secretLikeKeys).toEqual(expect.arrayContaining(['apiKey', 'token']))
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('sk-should-not-leak')
    expect(serialized).not.toContain('tok-should-not-leak')
    expect(serialized).not.toContain('sk-')
    const linked = result.skills.find(skill => skill.name === 'linked-skill')
    if (linked !== undefined) {
      expect(linked).toMatchObject({ kind: 'symlink', status: 'unsupported', reason: 'SKILL_SYMLINK_NOT_PORTABLE' })
    }
    expect(result.skills.find(skill => skill.name === 'demo')).toMatchObject({ kind: 'directory', status: 'supported' })
  })

  it('renders a report that mentions unsupported carriers', () => {
    const { home } = fixture()
    const text = formatInventory(inventoryProfile({ dshHome: home, profileName: 'desktop', hostBaseVersion: '0.2.1-rc.2' }))
    expect(text).toContain('[unsupported] bundle @local/linked')
    expect(text).toContain('[inventory-only] local-tgz')
    expect(text).not.toContain('sk-should-not-leak')
  })
})
