/** Signed update metadata must never turn feed tampering into an executable download. */
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyCustomUpdate } from '../src/custom-update-manifest.ts'
const key = generateKeyPairSync('ed25519')
const publicKey = key.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const bytes = Buffer.from('installer fixture')
const version = '0.2.1-alpha.3.20261015.11'
const asset = { target: 'win-x64', name: `deepseek-harness-${version}-win-x64-unsigned.exe`, size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), sha512: createHash('sha512').update(bytes).digest('base64') }
const payload = { schemaVersion: 1, version, source: 'a'.repeat(40), assets: [asset] }
function envelope(value: unknown, signingKey = key.privateKey): string {
  const raw = Buffer.from(JSON.stringify(value))
  return JSON.stringify({ payload: raw.toString('base64'), signature: sign(null, raw, signingKey).toString('base64') })
}
describe('custom update trust', () => {
  it('accepts the pinned signature and derives the only allowed download URL', () => {
    const verified = verifyCustomUpdate(envelope(payload), 'win-x64', publicKey)
    expect(verified.asset.url).toBe(`https://github.com/Myoontyee/deepseek-harness/releases/download/custom-v${version}/${asset.name}`)
    expect(verified.asset.sha512).toBe(asset.sha512)
  })
  it('rejects another signing identity and modified payload bytes', () => {
    expect(() => verifyCustomUpdate(envelope(payload, generateKeyPairSync('ed25519').privateKey), 'win-x64', publicKey)).toThrow(/signature/u)
    const signed = JSON.parse(envelope(payload))
    signed.payload = Buffer.from(JSON.stringify({ ...payload, version: '9.0.0' })).toString('base64')
    expect(() => verifyCustomUpdate(JSON.stringify(signed), 'win-x64', publicKey)).toThrow(/signature/u)
  })
  it.each(['../other.exe', 'https://evil.invalid/app.exe', 'deepseek-harness-9.0.0-win-x64-unsigned.exe'])(
    'rejects an authenticated but wrong artifact identity: %s', (name) => {
      expect(() => verifyCustomUpdate(envelope({ ...payload, assets: [{ ...asset, name }] }), 'win-x64', publicKey)).toThrow(/identity/u)
    })
  it('rejects a missing architecture, duplicated target and malformed version', () => {
    expect(() => verifyCustomUpdate(envelope(payload), 'mac-arm64', publicKey)).toThrow(/platform/u)
    expect(() => verifyCustomUpdate(envelope({ ...payload, assets: [asset, asset] }), 'win-x64', publicKey)).toThrow(/Duplicate/u)
    expect(() => verifyCustomUpdate(envelope({ ...payload, version: '../latest' }), 'win-x64', publicKey)).toThrow(/version/u)
  })
  it('rejects oversized and unrecognized metadata', () => {
    expect(() => verifyCustomUpdate('x'.repeat(131073), 'win-x64', publicKey)).toThrow(/large/u)
    expect(() => verifyCustomUpdate(envelope({ ...payload, url: 'https://evil.invalid' }), 'win-x64', publicKey)).toThrow()
  })
})
