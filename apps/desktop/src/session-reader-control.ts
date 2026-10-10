/** Native opt-in controls for the local conversation reader. */
import { app, clipboard, dialog, safeStorage } from 'electron'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { startSessionReader } from './session-reader-server.ts'
import type { DesktopMessages } from './locale.ts'

/** Owns a persistent local MCP endpoint and encrypted bearer credential. */
export class DesktopSessionReader {
  private server: Awaited<ReturnType<typeof startSessionReader>> | undefined
  private token = ''
  private port = 0
  private disposed = false
  private showing: Promise<void> | undefined
  private restoring: Promise<void> | undefined
  constructor(private readonly host: () => { url: string; cookie: string } | undefined, private readonly messages: () => DesktopMessages) {}
  private path(): string { return join(app.getPath('userData'), 'session-reader.dat') }
  private async save(enabled: boolean): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) throw new Error(this.messages().readerFailed)
    const file = this.path()
    await writeFile(`${file}.tmp`, safeStorage.encryptString(JSON.stringify({ enabled, token: this.token, port: this.port })), { mode: 0o600 })
    await rename(`${file}.tmp`, file)
  }
  /** Restore only a previously enabled, encrypted configuration. */
  restore(): Promise<void> {
    return this.restoring ??= this.restoreSaved()
  }
  private async restoreSaved(): Promise<void> {
    let bytes: Buffer
    try { bytes = await readFile(this.path()) } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      throw error
    }
    if (this.disposed || !safeStorage.isEncryptionAvailable()) return
    const state: unknown = JSON.parse(safeStorage.decryptString(bytes))
    if (typeof state !== 'object' || state === null || !('enabled' in state) || state.enabled !== true) return
    if (!('token' in state) || typeof state.token !== 'string' || !/^[a-f0-9]{64}$/u.test(state.token)
      || !('port' in state) || typeof state.port !== 'number' || !Number.isInteger(state.port) || state.port < 1 || state.port > 65535) throw new Error(this.messages().readerFailed)
    this.token = state.token; this.port = state.port
    const server = await startSessionReader(this.port, this.token, this.host)
    if (this.disposed) await server.close(); else this.server = server
  }
  /** Display status and enable, copy configuration, or disable actions. */
  show(): Promise<void> {
    return this.showing ??= this.panel().catch(async () => {
      if (!this.disposed) await dialog.showMessageBox({ type: 'error', message: this.messages().readerFailed })
    }).finally(() => { this.showing = undefined })
  }
  private async panel(): Promise<void> {
    await this.restore()
    if (this.disposed) return
    const copy = this.messages()
    const current = this.server
    const active = current !== undefined
    const result = await dialog.showMessageBox({ title: copy.readerMenu, message: active ? copy.readerEnabled : copy.readerDisabled,
      detail: `${copy.readerDetail}${active ? `\n\n${current?.url}` : ''}`,
      buttons: active ? [copy.readerCopy, copy.readerDisable, copy.readerClose] : [copy.readerEnable, copy.readerClose],
      defaultId: active ? 0 : 1, cancelId: active ? 2 : 1, noLink: true })
    if (this.disposed) return
    if (active && result.response === 0) {
      clipboard.writeText(JSON.stringify({ mcpServers: { 'dsh-session-reader': { url: current?.url, headers: { Authorization: `Bearer ${this.token}` } } } }, null, 2))
    } else if (active && result.response === 1) {
      await this.save(false)
      await current?.close(); this.server = undefined; this.token = ''; this.port = 0
    } else if (!active && result.response === 0) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error(copy.readerFailed)
      this.token = randomBytes(32).toString('hex')
      const server = await startSessionReader(0, this.token, this.host)
      if (this.disposed) { await server.close(); return }
      this.server = server; this.port = Number(new URL(server.url).port)
      try { await this.save(true) } catch (error) { await server.close(); this.server = undefined; throw error }
      await this.panel()
    }
  }
  /** Stop accepting requests before Desktop exits. */
  async dispose(): Promise<void> {
    this.disposed = true
    await this.restoring?.catch(() => {})
    await this.server?.close(); this.server = undefined
  }
}
