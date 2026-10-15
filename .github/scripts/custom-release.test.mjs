import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { releaseIdentity } from './custom-release.mjs'

test('custom release preserves the full upstream base and increments Android code', () => {
  assert.deepEqual(releaseIdentity('custom-v0.2.1-alpha.3.20261015.1', '0.2.1-alpha.3'), {
    version: '0.2.1-alpha.3.20261015.1', androidCode: 2026101501,
  })
  assert.equal(releaseIdentity('custom-v0.2.1-test.20261015.2', '0.2.1').androidCode, 2026101502)
})

test('rejects mismatched versions, shell input, invalid dates and Android downgrades', () => {
  for (const tag of ['custom-v0.2.1-alpha.2.20261015.1', 'custom-v0.2.1-alpha.3.20260230.1',
    'custom-v0.2.1-alpha.3.20261015.0', 'custom-v0.2.1-alpha.3.20261015.100',
    'custom-v0.2.1-alpha.3.20261015.1;echo', 'custom-v0.2.1-alpha.3.20261008.2']) {
    assert.throws(() => releaseIdentity(tag, '0.2.1-alpha.3'))
  }
})

test('withholds checksums for incomplete drafts and distinguishes unsigned drafts from signed releases', () => {
  const parent = realpathSync(tmpdir())
  const root = mkdtempSync(join(parent, 'dsh-release-policy-'))
  try {
    const scripts = join(root, '.github/scripts')
    const assets = join(root, '.custom-release')
    mkdirSync(scripts, { recursive: true })
    mkdirSync(assets)
    copyFileSync(new URL('./custom-release.mjs', import.meta.url), join(scripts, 'custom-release.mjs'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.2.1-alpha.3' }))
    const version = '0.2.1-alpha.3.20261015.1'
    const invoke = command => {
      const result = spawnSync(process.execPath, [join(scripts, 'custom-release.mjs'), command], {
        env: { ...process.env, CUSTOM_RELEASE_VERSION: version }, encoding: 'utf8', timeout: 30000,
      })
      assert.equal(result.error, undefined)
      assert.equal(result.signal, null)
      return result
    }
    assert.notEqual(invoke('desktop-manifest').status, 0)
    for (const suffix of ['win-x64-unsigned.exe', 'mac-arm64-unsigned.dmg', 'mac-x64-unsigned.dmg', 'android-universal-unsigned.apk']) {
      writeFileSync(join(assets, `deepseek-harness-${version}-${suffix}`), suffix)
    }
    assert.equal(invoke('desktop-manifest').status, 0)
    assert.equal(readFileSync(join(assets, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').length, 4)
    assert.notEqual(invoke('manifest').status, 0)
    renameSync(join(assets, `deepseek-harness-${version}-android-universal-unsigned.apk`), join(assets, `deepseek-harness-${version}-android-universal.apk`))
    assert.equal(invoke('manifest').status, 0)
  } finally {
    if (dirname(root) !== parent) throw new Error('Unexpected test cleanup directory')
    rmSync(root, { recursive: true, force: true })
  }
})
