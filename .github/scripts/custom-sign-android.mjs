/** Finish a verified cloud draft with the Android key retained on the owner's Windows machine. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { releaseIdentity } from './custom-release.mjs'
import { signCustomUpdate, publishCustomUpdate } from './custom-update-channel.mjs'
import { verifyCustomUpdate } from '../../apps/desktop/src/custom-update-manifest.ts'

if (process.env.GITHUB_ACTIONS) throw new Error('Android signing is local only')
if (process.platform !== 'win32') throw new Error('This signing adapter requires the configured Windows Android SDK')
const root = fileURLToPath(new URL('../..', import.meta.url))
const [tag, runId] = process.argv.slice(2)
const { version, androidCode } = releaseIdentity(tag ?? '', JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version)
if (!/^\d+$/u.test(runId ?? '')) throw new Error('Supply the successful cloud release run ID')
const repository = 'Myoontyee/deepseek-harness'
const gh = args => execFileSync(process.env.GH_BIN ?? 'gh', args, { encoding: 'utf8' }).trim()
const release = () => {
  // The REST tag endpoint does not resolve unpublished drafts. The CLI locates
  // drafts by tag, then the release-ID endpoint supplies asset digests.
  const metadata = JSON.parse(gh(['release', 'view', tag, '--repo', repository, '--json', 'databaseId']))
  const value = JSON.parse(gh(['api', `repos/${repository}/releases/${metadata.databaseId}`]))
  return { isDraft: value.draft, assets: value.assets }
}
const initiallyDraft = release().isDraft
const run = JSON.parse(gh(['run', 'view', runId, '--repo', repository, '--json', 'headSha,conclusion,workflowName']))
const remoteCommit = JSON.parse(gh(['api', `repos/${repository}/commits/${tag}`])).sha
const localCommit = execFileSync('git', ['rev-parse', '--verify', `${tag}^{commit}`], { cwd: root, encoding: 'utf8' }).trim()
if (run.conclusion !== 'success' || run.workflowName !== 'Custom multiplatform release'
  || run.headSha !== remoteCommit || localCommit !== remoteCommit) throw new Error('Cloud build, local tag, and remote tag must identify the same successful source')
const updateKey = process.env.DSH_CUSTOM_UPDATE_PRIVATE_KEY
if (!updateKey) throw new Error('Configure the local custom-update signing key')
const keystore = process.env.DSH_ANDROID_KEYSTORE
const passwordFile = process.env.DSH_ANDROID_PASSWORD_FILE
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
if (!keystore || !passwordFile || !sdk) throw new Error('Configure local keystore, password-file and Android SDK paths')
const artifacts = join(root, '.artifacts')
mkdirSync(artifacts, { recursive: true })
const staging = mkdtempSync(join(artifacts, 'local-signed-release-'))
if (!initiallyDraft) {
  // Recover a network interruption after publication without modifying immutable installers.
  gh(['release', 'download', tag, '--repo', repository, '--dir', staging, '--pattern', 'update.json'])
  const manifest = join(staging, 'update.json'), raw = readFileSync(manifest, 'utf8')
  const assets = release().assets
  for (const target of ['win-x64', 'mac-arm64', 'mac-x64', 'android-universal']) {
    const checked = verifyCustomUpdate(raw, target)
    const asset = assets.find(item => item.name === checked.asset.name)
    if (checked.version !== version || checked.source !== remoteCommit || !asset
      || asset.digest !== `sha256:${checked.asset.sha256}` || asset.size !== checked.asset.size) throw new Error('Published update identity differs')
  }
  publishCustomUpdate({ gh, repository, tag, source: remoteCommit, version, staging, manifest })
  console.log(JSON.stringify({ version, directory: staging, source: remoteCommit, recoveredChannel: true }))
  process.exit(0)
}
const unsignedDirectory = join(staging, 'unsigned')
mkdirSync(unsignedDirectory)
const unsignedName = `deepseek-harness-${version}-android-universal-unsigned.apk`
gh(['release', 'download', tag, '--repo', repository, '--dir', unsignedDirectory, '--pattern', unsignedName])
gh(['release', 'download', tag, '--repo', repository, '--dir', staging, '--pattern', 'SHA256SUMS.txt'])
gh(['release', 'download', tag, '--repo', repository, '--dir', staging, '--pattern', 'UPDATE-PAYLOAD.json'])
const filename = `deepseek-harness-${version}-android-universal.apk`
const aligned = join(unsignedDirectory, 'aligned.apk')
const unsigned = join(unsignedDirectory, unsignedName)
const desktopNames = ['win-x64-unsigned.exe', 'mac-arm64-unsigned.dmg', 'mac-x64-unsigned.dmg']
  .map(suffix => `deepseek-harness-${version}-${suffix}`)
const expectedHashes = new Map(readFileSync(join(staging, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').map(line => {
  const match = /^([0-9a-f]{64})  (.+)$/u.exec(line)
  if (!match) throw new Error('Invalid draft checksum entry')
  return [match[2], match[1]]
}))
if (expectedHashes.size !== 4 || ![...desktopNames, unsignedName].every(name => expectedHashes.has(name))) throw new Error('Draft checksums do not describe the expected four builds')
const draftAssets = release().assets
for (const name of desktopNames) {
  const asset = draftAssets.find(item => item.name === name)
  if (!asset) throw new Error(`Missing desktop draft asset: ${name}`)
  if (asset.digest != null) {
    if (asset.digest !== `sha256:${expectedHashes.get(name)}`) throw new Error(`Desktop asset digest mismatch: ${name}`)
    continue
  }
  // Older GitHub servers may omit asset digests; only that asset needs a local download.
  gh(['release', 'download', tag, '--repo', repository, '--dir', staging, '--pattern', name])
  const file = join(staging, name)
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== expectedHashes.get(name)) throw new Error(`Download checksum mismatch: ${name}`)
}
if (createHash('sha256').update(readFileSync(unsigned)).digest('hex') !== expectedHashes.get(unsignedName)) throw new Error('Unsigned APK download checksum mismatch')
const badging = execFileSync(join(sdk, 'build-tools/35.0.0/aapt.exe'), ['dump', 'badging', unsigned], { encoding: 'utf8' })
if (!badging.includes(`package: name='io.jadegate.dsh.companion' versionCode='${androidCode}' versionName='${version}'`)) throw new Error('Unsigned APK identity or version differs from the release')
execFileSync(join(sdk, 'build-tools/35.0.0/zipalign.exe'), ['-p', '-f', '4', unsigned, aligned])
const signer = join(sdk, 'build-tools/35.0.0/lib/apksigner.jar')
const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/java.exe') : 'java'
const env = { ...process.env, DSH_ANDROID_STORE_PASSWORD: readFileSync(passwordFile, 'utf8').replace(/[\r\n]+$/u, '') }
execFileSync(java, ['-jar', signer, 'sign', '--ks', resolve(keystore), '--ks-key-alias', 'dsh-companion',
  '--ks-pass', 'env:DSH_ANDROID_STORE_PASSWORD', '--key-pass', 'env:DSH_ANDROID_STORE_PASSWORD',
  '--out', join(staging, filename), aligned], { env })
execFileSync(java, ['-jar', signer, 'verify', '--verbose', join(staging, filename)])
delete env.DSH_ANDROID_STORE_PASSWORD
if (process.env.DSH_ANDROID_BASELINE_APK) {
  const certificate = file => {
    const report = execFileSync(java, ['-jar', signer, 'verify', '--print-certs', file], { encoding: 'utf8' })
    const match = /certificate SHA-256 digest: ([0-9a-f]{64})/u.exec(report)
    if (!match) throw new Error('Cannot read APK signing identity')
    return match[1]
  }
  if (certificate(join(staging, filename)) !== certificate(process.env.DSH_ANDROID_BASELINE_APK)) throw new Error('Android signing identity changed; refusing to publish an incompatible upgrade')
}
const names = ['win-x64-unsigned.exe', 'mac-arm64-unsigned.dmg', 'mac-x64-unsigned.dmg', 'android-universal.apk']
  .map(suffix => `deepseek-harness-${version}-${suffix}`)
const sums = names.map(name => `${name === filename
  ? createHash('sha256').update(readFileSync(join(staging, name))).digest('hex')
  : expectedHashes.get(name)}  ${name}`).join('\n')
const updatePayload = JSON.parse(readFileSync(join(staging, 'UPDATE-PAYLOAD.json'), 'utf8'))
if (updatePayload.schemaVersion !== 1 || updatePayload.source !== remoteCommit || updatePayload.version !== version
  || !Array.isArray(updatePayload.assets) || updatePayload.assets.length !== 4) throw new Error('Update payload differs from verified source')
for (const asset of updatePayload.assets) {
  if (asset.sha256 !== expectedHashes.get(asset.name)) throw new Error('Update payload differs from installer checksums')
}
const apkBytes = readFileSync(join(staging, filename))
const androidAsset = updatePayload.assets.find(asset => asset.target === 'android-universal')
if (!androidAsset || androidAsset.name !== unsignedName) throw new Error('Android update payload identity differs')
Object.assign(androidAsset, { name: filename, size: apkBytes.length, sha256: createHash('sha256').update(apkBytes).digest('hex'),
  sha512: createHash('sha512').update(apkBytes).digest('base64') })
const updateManifest = join(staging, 'update.json')
const signedUpdate = signCustomUpdate(updatePayload, readFileSync(updateKey))
for (const target of ['win-x64', 'mac-arm64', 'mac-x64', 'android-universal']) verifyCustomUpdate(signedUpdate, target)
writeFileSync(updateManifest, signedUpdate)
const manifest = join(staging, 'SHA256SUMS.txt')
writeFileSync(manifest, `${sums}\n`)
if (!release().isDraft) throw new Error('Release was published by another actor; do not replace its assets')
gh(['release', 'upload', tag, join(staging, filename), updateManifest, '--repo', repository])
// The checksum file is replaced only while the release remains an unpublished draft.
gh(['release', 'upload', tag, manifest, '--clobber', '--repo', repository])
gh(['release', 'delete-asset', tag, unsignedName, '--yes', '--repo', repository])
gh(['release', 'delete-asset', tag, 'UPDATE-PAYLOAD.json', '--yes', '--repo', repository])
const completed = release()
if (!completed.isDraft || completed.assets.length !== 6
  || ![...names, 'SHA256SUMS.txt', 'update.json'].every(name => completed.assets.some(asset => asset.name === name))) throw new Error('Final release assets differ from the verified set')
gh(['release', 'edit', tag, '--repo', repository, '--draft=false'])
publishCustomUpdate({ gh, repository, tag, source: remoteCommit, version, staging, manifest: updateManifest })
console.log(JSON.stringify({ version, directory: staging, source: remoteCommit, url: `https://github.com/${repository}/releases/tag/${tag}` }))
