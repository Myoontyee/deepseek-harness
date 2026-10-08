/** Add the pinned official Windows GitHub CLI and its license to Desktop resources. */
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import extractZip from 'extract-zip'
import { downloadPrimaryRuntimeAsset } from '../../../scripts/primary-runtime/prepare.ts'

const version = '2.102.0'
const sha256 = 'ae64e556ecc240b200f7eba60d550e4bb60d78e860e69dd88c449405b86067f4'
const url = `https://github.com/cli/cli/releases/download/v${version}/gh_${version}_windows_amd64.zip`

/**
 * Prepare Windows GitHub sign-in without relying on a developer's PATH.
 * @param target - Desktop target identifier; other platforms keep their installed CLI.
 * @param runtime - build-owned runtime resource directory.
 * @param cache - build-owned archive cache; every reuse is SHA-256 checked.
 * @returns completion after executable, license and source metadata are present.
 */
export async function prepareGithubCli(target: string, runtime: string, cache: string): Promise<void> {
  if (target !== 'win-x64') return
  await mkdir(cache, { recursive: true })
  const archive = await downloadPrimaryRuntimeAsset(url, sha256, cache)
  const staging = await mkdtemp(join(cache, 'github-cli-'))
  try {
    await extractZip(archive, { dir: staging })
    await mkdir(join(runtime, 'bin'), { recursive: true })
    await mkdir(join(runtime, 'licenses'), { recursive: true })
    await copyFile(join(staging, 'bin', 'gh.exe'), join(runtime, 'bin', 'gh.exe'))
    await chmod(join(runtime, 'bin', 'gh.exe'), 0o755)
    await copyFile(join(staging, 'LICENSE'), join(runtime, 'licenses', 'GitHub-CLI-MIT.txt'))
    await writeFile(join(runtime, 'github-cli.json'), JSON.stringify({ version, url, sha256 }, null, 2) + '\n')
  } finally {
    // mkdtemp created this exact build-owned directory; no user-selected path is removed.
    await rm(staging, { recursive: true, force: true })
  }
}
