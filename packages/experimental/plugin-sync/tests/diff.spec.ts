// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { diffInventories } from '../src/diff.ts'
import { inventoryProfile } from '../src/inventory.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function homeWith(packages: Record<string, string>, bundles: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-sync-diff-'))
  roots.push(root)
  const profile = join(root, '.dsh', 'profiles', 'desktop')
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: packages,
    dsh: { profile: { bundles } },
  }))
  return join(root, '.dsh')
}

function inventory(home: string, baseVersion = '0.2.1-rc.2') {
  return inventoryProfile({ dshHome: home, profileName: 'desktop', hostBaseVersion: baseVersion })
}

describe('dry-run diff', () => {
  it('reports add, update, same and target-only removals without applying anything', () => {
    const source = inventory(homeWith({
      '@scope/registry': '1.2.3', '@scope/new': '2.0.0',
    }, ['@scope/registry', '@scope/new']))
    const target = inventory(homeWith({
      '@scope/registry': '1.2.2', '@scope/extra': '4.5.6',
    }, ['@scope/registry', '@scope/extra']))
    const result = diffInventories(source, target)
    expect(result.compatible).toBe(true)
    expect(result.entries.find(entry => entry.name === '@scope/registry')?.action).toBe('update')
    expect(result.entries.find(entry => entry.name === '@scope/new')?.action).toBe('add')
    expect(result.entries.find(entry => entry.name === '@scope/extra')?.action).toBe('remove')
    expect(result.summary).toMatchObject({ add: 1, update: 1, remove: 1 })
  })

  it('turns a target base-version mismatch into an explicit rejection', () => {
    const source = inventory(homeWith({ '@scope/registry': '1.2.3' }, ['@scope/registry']))
    const target = inventory(homeWith({ '@scope/registry': '1.2.3' }, ['@scope/registry']), '0.2.1-rc.3')
    const result = diffInventories(source, target)
    expect(result.compatible).toBe(false)
    expect(result.rejections).toEqual(expect.arrayContaining([expect.stringContaining('TARGET_BASE_VERSION_MISMATCH')]))
  })

  it('keeps unsupported carriers visible instead of dropping them', () => {
    const source = inventory(homeWith({ '@local/linked': 'link:./missing' }, ['@local/linked']))
    const target = inventory(homeWith({}, []))
    const result = diffInventories(source, target)
    expect(result.entries.find(entry => entry.name === '@local/linked')?.action).toBe('unsupported')
    expect(result.unsupported.map(item => item.name)).toContain('@local/linked')
    expect(result.summary.unsupported).toBe(1)
  })

  it('does not mark a file: tarball as applyable in Phase 0', () => {
    const root = homeWith({ 'local-tgz': 'file:./local.tgz' }, ['local-tgz'])
    writeFileSync(join(root, 'profiles', 'desktop', 'local.tgz'), 'bytes')
    const result = diffInventories(inventory(root), inventory(homeWith({}, [])))
    expect(result.entries.find(entry => entry.name === 'local-tgz')?.action).toBe('inventory-only')
    expect(result.summary.inventoryOnly).toBe(1)
  })
})
