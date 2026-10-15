/** Local update signing and monotonic channel trust use disposable keys in CI. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { signCustomUpdate, signedUpdateVersion } from './custom-update-channel.mjs'
const key = generateKeyPairSync('ed25519')
const publicKey = key.publicKey.export({ type: 'spki', format: 'pem' })
test('round trips authenticated version bytes', () => {
  const signed = signCustomUpdate({ version: '0.2.1-alpha.3.20261015.11' }, key.privateKey, publicKey)
  assert.equal(signedUpdateVersion(signed, publicKey), '0.2.1-alpha.3.20261015.11')
})
test('a different local key cannot publish updates for existing installations', () => {
  assert.throws(() => signCustomUpdate({ version: '1.0.0' }, key.privateKey), /differs/)
  const signed = JSON.parse(signCustomUpdate({ version: '1.0.0' }, key.privateKey, publicKey))
  signed.payload = Buffer.from('{"version":"9.0.0"}').toString('base64')
  assert.throws(() => signedUpdateVersion(JSON.stringify(signed), publicKey), /signature/)
})
