/** Finish a verified cloud draft with the Android key retained on the owner's Windows machine. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { releaseIdentity } from './custom-release.mjs'

if (process.env.GITHUB_ACTIONS) throw new Error('Android signing is local only')
if (process.platform !== 'win32') throw new Error('This signing adapter requires the configured Windows Android SDK')
const root = fileURLToPath(new URL('../..', import.meta.url))
const [tag, runId] = process.argv.slice(2)
const { version } = releaseIdentity(tag ?? '', JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version)
if (!/^\d+$/u.test(runId ?? '')) throw new Error('Supply the successful cloud release run ID')
const repository = 'Myoontyee/deepseek-harness'
const gh = args => execFileSync(process.env.GH_BIN ?? 'gh', args, { encoding: 'utf8' }).trim()
const release = () => JSON.parse(gh(['release', 'view', tag, '--repo', repository, '--json', 'isDraft,assets']))
if (!release().isDraft) throw new Error('Only an unpublished draft may be completed; published releases are immutable')
const run = JSON.parse(gh(['run', 'view', runId, '--repo', repository, '--json', 'headSha,conclusion,workflowName']))
const remoteCommit = JSON.parse(gh(['api', `repos/${repository}/commits/${tag}`])).sha
const localCommit = execFileSync('git', ['rev-parse', '--verify', `${tag}^{commit}`], { cwd: root, encoding: 'utf8' }).trim()
if (run.conclusion !== 'success' || run.workflowName !== 'Custom multiplatform release'
  || run.headSha !== remoteCommit || localCommit !== remoteCommit) throw new Error('Cloud build, local tag, and remote tag must identify the same successful source')
const keystore = process.env.DSH_ANDROID_KEYSTORE
const passwordFile = process.env.DSH_ANDROID_PASSWORD_FILE
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
if (!keystore || !passwordFile || !sdk) throw new Error('Configure local keystore, password-file and Android SDK paths')
const env = { ...process.env, DSH_ANDROID_STORE_PASSWORD: readFileSync(passwordFile, 'utf8').trimEnd() }
const artifacts = join(root, '.artifacts')
mkdirSync(artifacts, { recursive: true })
const staging = mkdtempSync(join(artifacts, 'local-signed-release-'))
const unsignedDirectory = join(staging, 'unsigned')
gh(['run', 'download', runId, '--repo', repository, '--name', 'custom-android', '--dir', unsignedDirectory])
gh(['release', 'download', tag, '--repo', repository, '--dir', staging, '--pattern', '*.exe', '--pattern', '*.dmg'])
const filename = `deepseek-harness-${version}-android-universal.apk`
const aligned = join(unsignedDirectory, 'aligned.apk')
const unsigned = join(unsignedDirectory, `deepseek-harness-${version}-android-universal-unsigned.apk`)
execFileSync(join(sdk, 'build-tools/35.0.0/zipalign.exe'), ['-p', '-f', '4', unsigned, aligned])
const signer = join(sdk, 'build-tools/35.0.0/lib/apksigner.jar')
const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/java.exe') : 'java'
execFileSync(java, ['-jar', signer, 'sign', '--ks', resolve(keystore), '--ks-key-alias', 'dsh-companion',
  '--ks-pass', 'env:DSH_ANDROID_STORE_PASSWORD', '--key-pass', 'env:DSH_ANDROID_STORE_PASSWORD',
  '--out', join(staging, filename), aligned], { env })
execFileSync(java, ['-jar', signer, 'verify', '--verbose', join(staging, filename)])
delete env.DSH_ANDROID_STORE_PASSWORD
const names = ['win-x64-unsigned.exe', 'mac-arm64-unsigned.dmg', 'mac-x64-unsigned.dmg', 'android-universal.apk']
  .map(suffix => `deepseek-harness-${version}-${suffix}`)
const sums = names.map(name => `${createHash('sha256').update(readFileSync(join(staging, name))).digest('hex')}  ${name}`).join('\n')
const manifest = join(staging, 'SHA256SUMS.txt')
writeFileSync(manifest, `${sums}\n`)
if (!release().isDraft) throw new Error('Release was published by another actor; do not replace its assets')
gh(['release', 'upload', tag, join(staging, filename), '--repo', repository])
// The checksum file is replaced only while the release remains an unpublished draft.
gh(['release', 'upload', tag, manifest, '--clobber', '--repo', repository])
const completed = release()
if (!completed.isDraft || completed.assets.length !== 5
  || ![...names, 'SHA256SUMS.txt'].every(name => completed.assets.some(asset => asset.name === name))) throw new Error('Final release assets differ from the verified set')
gh(['release', 'edit', tag, '--repo', repository, '--draft=false'])
console.log(JSON.stringify({ version, directory: staging, source: remoteCommit, url: `https://github.com/${repository}/releases/tag/${tag}` }))
