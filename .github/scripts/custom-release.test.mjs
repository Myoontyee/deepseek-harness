import assert from 'node:assert/strict'
import { test } from 'node:test'
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
