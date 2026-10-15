/** Publish a signed custom update pointer after immutable installers are public. Signing stays local. */
import { createPublicKey, sign, verify } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gt, valid } from 'semver'
import { CUSTOM_UPDATE_PUBLIC_KEY } from '../../apps/desktop/src/custom-update-key.ts'

/** Sign the exact bytes that clients authenticate; reject a mismatched local key before publication. */
export function signCustomUpdate(payload, privateKey, trustedKey = CUSTOM_UPDATE_PUBLIC_KEY) {
  const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' })
  if (publicKey !== trustedKey) throw new Error('Local update key differs from the key pinned in this release')
  const bytes = Buffer.from(JSON.stringify(payload))
  return JSON.stringify({ payload: bytes.toString('base64'), signature: sign(null, bytes, privateKey).toString('base64') })
}

/** Read a signed pointer for monotonic publication; invalid pointers must be investigated, not replaced silently. */
export function signedUpdateVersion(raw, trustedKey = CUSTOM_UPDATE_PUBLIC_KEY) {
  const envelope = JSON.parse(raw), bytes = Buffer.from(envelope.payload, 'base64')
  if (!verify(null, bytes, trustedKey, Buffer.from(envelope.signature, 'base64'))) throw new Error('Existing update pointer has an invalid signature')
  const version = JSON.parse(bytes.toString()).version
  if (valid(version) === null) throw new Error('Existing update pointer has an invalid version')
  return version
}

/** Move the public pointer forward only after this exact release is published. */
export function publishCustomUpdate({ gh, repository, tag, source, version, staging, manifest }) {
  const released = JSON.parse(gh(['release', 'view', tag, '--repo', repository, '--json', 'isDraft,assets']))
  if (released.isDraft || !released.assets.some(asset => asset.name === 'update.json')) throw new Error('Publish immutable signed assets before the update pointer')
  const channel = 'custom-updates'
  let existing
  try { existing = JSON.parse(gh(['release', 'view', channel, '--repo', repository, '--json', 'assets'])) }
  catch (error) {
    if (!String(error.stderr ?? error).includes('release not found')) throw error
    gh(['release', 'create', channel, '--repo', repository, '--target', source, '--prerelease', '--latest=false',
      '--title', 'Custom update channel', '--notes', 'Signed update metadata. Installers remain attached to immutable custom-v releases.'])
    existing = { assets: [] }
  }
  if (existing.assets.some(asset => asset.name === 'update.json')) {
    const previous = join(staging, 'previous-update.json')
    gh(['release', 'download', channel, '--repo', repository, '--pattern', 'update.json', '--output', previous])
    const prior = readFileSync(previous, 'utf8'), priorVersion = signedUpdateVersion(prior)
    if (priorVersion === version && prior === readFileSync(manifest, 'utf8')) return
    if (!gt(version, priorVersion)) throw new Error('Refusing to downgrade or rewrite the custom update channel')
  }
  gh(['release', 'upload', channel, manifest, '--repo', repository, '--clobber'])
  const check = join(staging, 'published-update.json')
  gh(['release', 'download', channel, '--repo', repository, '--pattern', 'update.json', '--output', check])
  if (readFileSync(check, 'utf8') !== readFileSync(manifest, 'utf8')) throw new Error('Published update pointer differs from signed bytes')
  writeFileSync(join(staging, 'update-channel-verified.txt'), `${version}\n`)
}
