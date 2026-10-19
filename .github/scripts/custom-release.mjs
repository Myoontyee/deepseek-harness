/** Validate custom release identities and package the matching source on native runners. */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const output = join(root, '.custom-release')
const desktop = join(root, 'apps/desktop')

/** Parse the upstream-based dated version; dates and Android update codes must be real and ordered. */
export function releaseIdentity(tag, base) {
  const suffix = base.includes('-') ? '.' : '-test.'
  const prefix = `custom-v${base}${suffix}`
  if (!tag.startsWith(prefix)) throw new Error('Tag must preserve the complete upstream version')
  const match = /^(\d{8})\.([1-9]\d?)$/u.exec(tag.slice(prefix.length))
  if (!match) throw new Error('Expected YYYYMMDD.index, index 1 through 99')
  const date = match[1]
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== iso) throw new Error('Invalid release date')
  const androidCode = Number(date) * 100 + Number(match[2])
  if (androidCode <= 2026100803 || androidCode > 2100000000) throw new Error('Android version code is outside the supported upgrade range')
  return { version: tag.slice('custom-v'.length), androidCode }
}

function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' && command === 'pnpm' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.signal ?? result.status})`)
}

function baseVersion() {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
}

function version() {
  return releaseIdentity(`custom-v${process.env.CUSTOM_RELEASE_VERSION ?? ''}`, baseVersion()).version
}

function retain(path, name) {
  mkdirSync(output, { recursive: true })
  copyFileSync(path, join(output, name))
}

function main(command) {
  if (command === 'validate') {
    const tag = process.env.CUSTOM_RELEASE_TAG ?? ''
    const identity = releaseIdentity(tag, baseVersion())
    const commit = execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], { cwd: root, encoding: 'utf8' }).trim()
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    if (head !== commit) throw new Error('Checked-out source does not match the release tag')
    const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', `dsh-v${baseVersion()}`, head], { cwd: root })
    if (ancestry.status !== 0) throw new Error('Release must contain the upstream release tag')
    writeFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\nversion=${identity.version}\ncommit=${commit}\nandroid_code=${identity.androidCode}\n`, { flag: 'a' })
    return
  }
  const buildVersion = version()
  if (command === 'desktop') {
    const target = process.env.CUSTOM_RELEASE_TARGET
    const expected = { 'win-x64': ['win32', 'x64'], 'mac-arm64': ['darwin', 'arm64'], 'mac-x64': ['darwin', 'x64'] }[target]
    if (!expected || process.platform !== expected[0] || process.arch !== expected[1]) throw new Error('Use a native matching Desktop runner')
    const settings = join(desktop, '.env.windows')
    if (process.platform === 'win32') {
      if (existsSync(settings)) throw new Error('Refusing to overwrite local Desktop settings')
      writeFileSync(settings, 'DSH_DESKTOP_APP_ID=com.deepseek.dsh\nDSH_DESKTOP_AUTO_UPDATE_ENV=production\nDSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN=https://harness.deepseek.com\nDSH_DESKTOP_MANDATORY_UPDATE_CONFIG={}\n')
    }
    try {
      run('pnpm', ['--dir', 'apps/desktop', 'exec', 'tsx', 'scripts/package-target.ts', target, '--unsigned', '--build-version', buildVersion], root, { ...process.env, DSH_CUSTOM_UPDATES: '1' })
      const dir = join(desktop, '.desktop-build/targets', target, 'unsigned-artifacts')
      const expectedName = `deepseek-harness-${buildVersion}-${target}-unsigned.${process.platform === 'win32' ? 'exe' : 'dmg'}`
      retain(join(dir, expectedName), expectedName)
    } finally {
      if (process.platform === 'win32') rmSync(settings)
    }
    return
  }
  if (command === 'android') {
    if (process.env.DSH_ANDROID_KEYSTORE || process.env.DSH_ANDROID_STORE_PASSWORD) throw new Error('Cloud Android builds must not receive signing credentials')
    const identity = releaseIdentity(`custom-v${buildVersion}`, baseVersion())
    for (const payload of [join(root, 'apps/android/app/src/main/assets/chat/index.html'),
      join(root, 'apps/android/app/src/main/jniLibs/arm64-v8a/libdsh_tailnet.so')]) {
      if (!existsSync(payload)) throw new Error(`Android release payload is incomplete: ${payload} is missing. Build the phone chat assets and native Tailscale helpers before packaging`)
    }
    const env = { ...process.env, DSH_ANDROID_VERSION_NAME: buildVersion, DSH_ANDROID_VERSION_CODE: String(identity.androidCode) }
    run('gradle', ['--no-daemon', ':app:assembleRelease'], join(root, 'apps/android'), env)
    retain(join(root, 'apps/android/app/build/outputs/apk/release/app-release-unsigned.apk'), `deepseek-harness-${buildVersion}-android-universal-unsigned.apk`)
    return
  }
  if (command === 'manifest' || command === 'desktop-manifest') {
    const required = ['win-x64-unsigned.exe', 'mac-arm64-unsigned.dmg', 'mac-x64-unsigned.dmg', 'android-universal.apk']
      .map(suffix => `deepseek-harness-${buildVersion}-${suffix}`)
    if (command === 'desktop-manifest') required[3] = `deepseek-harness-${buildVersion}-android-universal-unsigned.apk`
    const files = readdirSync(output).filter(name => name !== 'SHA256SUMS.txt' && name !== 'UPDATE-PAYLOAD.json').sort()
    if (files.length !== required.length || required.some(name => !files.includes(name))) throw new Error('Release assets are incomplete or include unexpected files')
    const hashes = files.map(name => `${createHash('sha256').update(readFileSync(join(output, name))).digest('hex')}  ${name}`).join('\n')
    writeFileSync(join(output, 'SHA256SUMS.txt'), `${hashes}\n`)
    if (command === 'desktop-manifest') {
      const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
      const assets = required.map(name => {
        const bytes = readFileSync(join(output, name))
        const target = name.includes('-android-') ? 'android-universal'
          : name.includes('-win-') ? 'win-x64' : name.includes('-mac-arm64-') ? 'mac-arm64' : 'mac-x64'
        return { target, name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
          sha512: createHash('sha512').update(bytes).digest('base64') }
      })
      writeFileSync(join(output, 'UPDATE-PAYLOAD.json'), JSON.stringify({ schemaVersion: 1, version: buildVersion, source, assets }))
    }
    return
  }
  throw new Error('Unknown release operation')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv[2])
