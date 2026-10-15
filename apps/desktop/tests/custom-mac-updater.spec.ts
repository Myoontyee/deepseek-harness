/** Guided Mac updates never open partial, altered or unauthenticated installers. */
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const pair = generateKeyPairSync('ed25519')
const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const fetcher = vi.fn(), openPath = vi.fn(async () => '')
let directory = ''
vi.mock('electron', () => ({ app: { getVersion: () => '1.0.0', getPath: () => directory },
  net: { fetch: (...args: unknown[]) => fetcher(...args) }, shell: { openPath } }))
vi.mock('../src/custom-update-key.ts', () => ({ CUSTOM_UPDATE_PUBLIC_KEY: publicKey }))
const { CustomMacUpdater } = await import('../src/custom-mac-updater.ts')
const binary = Buffer.from('verified dmg fixture'), version = '2.0.0'
const name = `deepseek-harness-${version}-mac-${process.arch}-unsigned.dmg`
function manifest() {
  const payload = Buffer.from(JSON.stringify({ schemaVersion: 1, version, source: 'a'.repeat(40), assets: [{
    target: `mac-${process.arch}`, name, size: binary.length,
    sha256: createHash('sha256').update(binary).digest('hex'), sha512: createHash('sha512').update(binary).digest('base64'),
  }] }))
  return JSON.stringify({ payload: payload.toString('base64'), signature: sign(null, payload, pair.privateKey).toString('base64') })
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dsh-custom-update-'))
  fetcher.mockReset(); openPath.mockClear()
})
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })
it('downloads and verifies before offering an explicit Finder handoff', async () => {
  fetcher.mockResolvedValueOnce(new Response(manifest())).mockResolvedValueOnce(new Response(binary))
  const updater = new CustomMacUpdater(), ready = vi.fn()
  updater.on('update-downloaded', ready)
  expect(await updater.checkForUpdates()).toMatchObject({ isUpdateAvailable: true })
  const [path] = await updater.downloadUpdate()
  expect(ready).toHaveBeenCalledWith({ version })
  expect(openPath).not.toHaveBeenCalled()
  await updater.openDownloaded()
  expect(openPath).toHaveBeenCalledWith(path)
  await writeFile(path!, 'changed after download')
  await expect(updater.openDownloaded()).rejects.toThrow(/changed/u)
  expect(openPath).toHaveBeenCalledTimes(1)
})
it.each(['truncated', 'oversized'])('removes a %s transfer and never offers it to Finder', async (kind) => {
  const bytes = kind === 'truncated' ? binary.subarray(0, 3) : Buffer.concat([binary, binary])
  fetcher.mockResolvedValueOnce(new Response(manifest())).mockResolvedValueOnce(new Response(bytes))
  const updater = new CustomMacUpdater(), ready = vi.fn()
  updater.on('update-downloaded', ready)
  await updater.checkForUpdates()
  await expect(updater.downloadUpdate()).rejects.toThrow()
  expect(await readdir(join(directory, 'custom-updates'))).toEqual([])
  expect(ready).not.toHaveBeenCalled()
  expect(openPath).not.toHaveBeenCalled()
})
it('rejects a tampered manifest before requesting an installer', async () => {
  const data = JSON.parse(manifest()); data.signature = Buffer.alloc(64).toString('base64')
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)))
  await expect(new CustomMacUpdater().checkForUpdates()).rejects.toThrow(/signature/u)
  expect(fetcher).toHaveBeenCalledTimes(1)
})
