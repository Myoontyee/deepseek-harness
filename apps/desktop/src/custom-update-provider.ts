/** electron-updater only sees metadata authenticated by our pinned public key. */
import electronUpdater from 'electron-updater'
import type { AppUpdater, UpdateInfo } from 'electron-updater'
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider.js'
import { CUSTOM_UPDATE_FEED, verifyCustomUpdate } from './custom-update-manifest.ts'
/** Windows NSIS provider without an unsigned feed fallback. */
export class CustomUpdateProvider extends electronUpdater.Provider<UpdateInfo> {
  /** @param _config - Provider marker. @param _updater - Owner. @param runtime - Electron HTTP transport. */
  constructor(_config: unknown, _updater: AppUpdater, runtime: ProviderRuntimeOptions) { super(runtime) }
  /** @returns Signed metadata for the installed Windows architecture. */
  async getLatestVersion(): Promise<UpdateInfo> {
    const release = verifyCustomUpdate(await this.httpRequest(new URL(CUSTOM_UPDATE_FEED)) ?? '', `win-${process.arch}`)
    return { version: release.version, releaseDate: '', files: [{ url: release.asset.url, sha512: release.asset.sha512, size: release.asset.size }],
      path: release.asset.url, sha512: release.asset.sha512 }
  }
  /** @param info - Authenticated metadata retained by the updater. @returns Immutable package URLs and checksums. */
  resolveFiles(info: UpdateInfo) { return info.files.map(file => ({ url: new URL(file.url), info: file })) }
}
