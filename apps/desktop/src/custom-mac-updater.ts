/** Guided macOS updates: authenticate and download a DMG without replacing an unsigned running app. */
import { EventEmitter } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { app, net, shell } from 'electron'
import { gt } from 'semver'
import { CUSTOM_UPDATE_FEED, verifyCustomUpdate } from './custom-update-manifest.ts'
import type { CustomUpdateRelease } from './custom-update-manifest.ts'

/** Keeps unsigned macOS installation an explicit Finder action after a verified download. */
export class CustomMacUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  channel = 'nightly'
  allowPrerelease = true
  allowDowngrade = false
  private release: CustomUpdateRelease | undefined
  private downloaded: string | undefined
  /** @returns Authenticated update availability for this Mac. */
  async checkForUpdates() {
    const response = await net.fetch(CUSTOM_UPDATE_FEED, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error(`Custom update check failed (${response.status})`)
    this.release = verifyCustomUpdate(await response.text(), `mac-${process.arch}`)
    return { updateInfo: { version: this.release.version }, isUpdateAvailable: gt(this.release.version, app.getVersion()) }
  }
  /** @returns The verified DMG path; partial or corrupted downloads are never offered to Finder. */
  async downloadUpdate(): Promise<string[]> {
    const release = this.release
    if (release === undefined) throw new Error('No authenticated custom update')
    const directory = join(app.getPath('userData'), 'custom-updates')
    await mkdir(directory, { recursive: true })
    const destination = join(directory, release.asset.name), temporary = `${destination}.${randomUUID()}.part`
    const response = await net.fetch(release.asset.url, { signal: AbortSignal.timeout(30 * 60_000) })
    if (!response.ok || response.body === null) throw new Error(`Custom update download failed (${response.status})`)
    const file = await open(temporary, 'wx')
    const reader = response.body.getReader(), hash = createHash('sha512')
    let transferred = 0
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        transferred += chunk.value.byteLength
        if (transferred > release.asset.size) throw new Error('Custom update size exceeds signed manifest')
        hash.update(chunk.value)
        await file.writeFile(chunk.value)
        this.emit('download-progress', { percent: transferred / release.asset.size * 100 })
      }
      if (transferred !== release.asset.size || hash.digest('base64') !== release.asset.sha512) throw new Error('Custom update checksum differs')
      await file.close()
      await rename(temporary, destination)
      this.downloaded = destination
      this.emit('update-downloaded', { version: release.version })
      return [destination]
    } finally {
      await reader.cancel().catch(() => undefined)
      await file.close().catch(() => undefined)
      await rm(temporary, { force: true })
    }
  }
  /** @returns Finder handoff only after rechecking the cached bytes. */
  async openDownloaded(): Promise<void> {
    if (this.downloaded === undefined || this.release === undefined) throw new Error('Custom update is not downloaded')
    const hash = createHash('sha512')
    for await (const chunk of createReadStream(this.downloaded)) hash.update(chunk)
    if ((await stat(this.downloaded)).size !== this.release.asset.size
      || hash.digest('base64') !== this.release.asset.sha512) throw new Error('Cached custom update was changed')
    const error = await shell.openPath(this.downloaded)
    if (error !== '') throw new Error(error)
  }
  /** Unsigned macOS apps cannot use the standard signed-bundle replacement flow. */
  quitAndInstall(): void { throw new Error('Use the guided macOS installer') }
}
