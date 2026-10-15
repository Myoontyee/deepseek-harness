/** Authenticate custom release metadata before exposing any download to the updater. */
import { verify } from 'node:crypto'
import { valid } from 'semver'
import { z } from 'zod'
import { CUSTOM_UPDATE_PUBLIC_KEY } from './custom-update-key.ts'
/** Public distribution repository; clients never receive GitHub credentials. */
export const CUSTOM_UPDATE_REPOSITORY = 'Myoontyee/deepseek-harness'
/** Mutable pointer containing a locally signed release manifest. */
export const CUSTOM_UPDATE_FEED = `https://github.com/${CUSTOM_UPDATE_REPOSITORY}/releases/download/custom-updates/update.json`
const asset = z.object({ target: z.enum(['win-x64', 'mac-arm64', 'mac-x64', 'android-universal']),
  name: z.string().max(180), size: z.number().int().positive().max(5_000_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u), sha512: z.string().regex(/^[A-Za-z0-9+/]{86}==$/u) }).strict()
const payloadSchema = z.object({ schemaVersion: z.literal(1), version: z.string().max(80),
  source: z.string().regex(/^[a-f0-9]{40}$/u), assets: z.array(asset).min(1).max(4) }).strict()
/** Authenticated package and immutable release URL. */
export type CustomUpdateAsset = z.infer<typeof asset> & { url: string }
/** Verified release identity and selected platform artifact. */
export interface CustomUpdateRelease { version: string; source: string; asset: CustomUpdateAsset }
/**
 * Reject unsigned, malformed, cross-platform and path-injected metadata.
 * @param raw - Signed envelope from the fixed feed.
 * @param target - Exact installed platform and architecture.
 * @param publicKey - Pinned verification key, replaceable by isolated tests.
 * @returns Authenticated release and repository-owned download URL.
 */
export function verifyCustomUpdate(raw: string, target: string, publicKey = CUSTOM_UPDATE_PUBLIC_KEY): CustomUpdateRelease {
  if (raw.length > 131072) throw new Error('Custom update manifest is too large')
  const envelope = z.object({ payload: z.string().max(100000), signature: z.string().max(128) }).strict().parse(JSON.parse(raw))
  const bytes = Buffer.from(envelope.payload, 'base64'), signature = Buffer.from(envelope.signature, 'base64')
  if (bytes.toString('base64') !== envelope.payload || signature.toString('base64') !== envelope.signature
    || signature.length !== 64 || !verify(null, bytes, publicKey, signature)) throw new Error('Custom update signature is invalid')
  const payload = payloadSchema.parse(JSON.parse(bytes.toString('utf8')))
  if (valid(payload.version) === null || !/^[0-9A-Za-z.+-]+$/u.test(payload.version)) throw new Error('Custom update version is invalid')
  if (new Set(payload.assets.map(item => item.target)).size !== payload.assets.length) throw new Error('Duplicate custom update target')
  for (const item of payload.assets) {
    const suffix = item.target === 'android-universal' ? 'android-universal.apk'
      : `${item.target}-unsigned.${item.target === 'win-x64' ? 'exe' : 'dmg'}`
    if (item.name !== `deepseek-harness-${payload.version}-${suffix}`) throw new Error('Custom update artifact identity differs')
  }
  const selected = payload.assets.find(item => item.target === target)
  if (selected === undefined) throw new Error('Custom update does not support this platform')
  return { version: payload.version, source: payload.source, asset: { ...selected,
    url: `https://github.com/${CUSTOM_UPDATE_REPOSITORY}/releases/download/custom-v${payload.version}/${selected.name}` } }
}
