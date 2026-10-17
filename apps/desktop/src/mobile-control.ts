/** Native phone-pairing controls; the authenticated Host URL never enters the dialog. */
import { app, clipboard, dialog, safeStorage } from 'electron'
import { showPairingQr } from './pairing-qr.ts'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { discoverTailDevices, identifyTailnetPeer } from './tailscale-discovery.ts'
import { TailnetPairingServer } from './tailnet-pairing.ts'
import { MobileServer, mobileAddresses } from './mobile-server.ts'

/** Owns the opt-in listener and native approval dialogs for paired Android devices. */
export class DesktopMobileControl {
  private server: Promise<MobileServer> | undefined
  private showing: Promise<void> | undefined
  private disposed = false
  private discovery: TailnetPairingServer | undefined
  private discoveryTimer: ReturnType<typeof setTimeout> | undefined
  private discoveryWork: Promise<void> | undefined
  private discoveryEnabled = true
  /** @param host - Current loopback Host and its private authentication cookie. */
  constructor(private readonly host: () => { url: string; cookie: string } | undefined) {
    try { this.discoveryEnabled = JSON.parse(readFileSync(join(app.getPath('userData'), 'tailnet-discovery.json'), 'utf8')).enabled === true }
    catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') this.discoveryEnabled = false }
  }
  private setDiscoveryEnabled(enabled: boolean): void {
    writeFileSync(join(app.getPath('userData'), 'tailnet-discovery.json'), JSON.stringify({ enabled }), { mode: 0o600 })
    this.discoveryEnabled = enabled
  }
  private refreshDiscovery(): Promise<void> {
    if (this.disposed || !this.discoveryEnabled) return Promise.resolve()
    return this.discoveryWork ??= (async () => {
      try {
        if (this.disposed || !this.discoveryEnabled) return
        const self = (await discoverTailDevices()).find(peer => peer.self)
        if (this.disposed || !this.discoveryEnabled) return
        if (self?.address === this.discovery?.address) return
        await this.discovery?.stop(); this.discovery = undefined
        if (!self || this.disposed || !this.discoveryEnabled) return
        const address = self.address
        const candidate = new TailnetPairingServer(address, {
          verify: identifyTailnetPeer,
          authorize: async (name, signal) => {
            if (signal.aborted || this.disposed || !this.discoveryEnabled) throw new Error('Phone control disabled')
            const gateway = await this.gateway()
            if (!gateway.enabled) await gateway.start(address)
            return gateway.authorizeTailnetPeer(name, signal, address)
          },
        })
        await candidate.start()
        if (this.disposed || !this.discoveryEnabled) await candidate.stop(); else this.discovery = candidate
      } finally {
        this.discoveryWork = undefined
        if (!this.disposed && this.discoveryEnabled) this.discoveryTimer = setTimeout(() => {
          void this.refreshDiscovery().catch(() => { /* Retry when the local Tailscale client becomes available. */ })
        }, 30000)
      }
    })()
  }
  private isDisposed(): boolean {
    return this.disposed
  }
  private gateway(): Promise<MobileServer> {
    if (this.isDisposed()) return Promise.reject(new Error('DSH is closing'))
    return (this.server ??= MobileServer.create({
      path: join(app.getPath('userData'), 'mobile-control.dat'),
      seal: (value) => {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密服务不可用，无法启用手机控制')
        return safeStorage.encryptString(value)
      },
      unseal: value => safeStorage.decryptString(value),
      host: this.host,
      approve: async (label, options) => {
        if (this.isDisposed()) return false
        const result = await dialog.showMessageBox({
          type: 'question',
          title: 'DSH 手机控制',
          message: `允许“${label}”控制此电脑上的 DSH？`,
          detail:
            '此手机可以查看对话、发送任务、停止任务和处理工具确认。只允许你信任的设备。你可以随时在“应用 → 手机控制”撤销授权。' + (options?.switchingNetwork ? '\n允许后将切换为 Tailscale 连接，现有局域网手机连接会断开。' : ''),
          buttons: ['允许', '拒绝'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        })
        return !this.isDisposed() && result.response === 0
      },
    }).catch((error: unknown) => {
      this.server = undefined
      throw error
    }))
  }
  /** Restore a previously enabled listener after the Desktop Host has started. */
  async restore(): Promise<void> {
    if (this.isDisposed()) return
    const server = await this.gateway()
    if (!this.isDisposed()) await server.restore()
    if (!this.isDisposed()) await this.refreshDiscovery()
  }
  /** Show connection status, a short-lived pairing code, and device revocation controls. */
  show(): Promise<void> {
    return (this.showing ??= this.panel()
      .catch(async (error: unknown) => {
        await dialog.showMessageBox({
          type: 'error',
          title: 'DSH 手机控制',
          message: '无法打开手机连接',
          detail: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        this.showing = undefined
      }))
  }
  private async panel(): Promise<void> {
    const server = await this.gateway()
    if (!server.enabled && this.discovery) {
      const choice = await dialog.showMessageBox({
        title: '手机连接', message: 'Tailscale 免扫码发现已开启',
        detail: '在手机应用内登录 Tailscale，选择此电脑；首次连接会在本电脑请求确认。',
        buttons: ['手动扫码连接', '关闭手机连接', '关闭面板'], defaultId: 2, cancelId: 2,
      })
      if (choice.response === 1) {
        this.setDiscoveryEnabled(false); clearTimeout(this.discoveryTimer)
        await this.discovery.stop(); this.discovery = undefined
        return
      }
      if (choice.response !== 0) return
    }
    if (!server.enabled) {
      const addresses = mobileAddresses().sort((a, b) => Number(b.startsWith('100.')) - Number(a.startsWith('100.'))).slice(0, 8)
      if (addresses.length === 0) {
        await dialog.showMessageBox({
          title: 'DSH 手机控制',
          message: '没有可用的局域网或私有网络地址',
          detail: '请连接 Wi-Fi、有线局域网或 Tailscale 后重试。',
        })
        return
      }
      const selection = await dialog.showMessageBox({
        type: 'question',
        title: 'DSH 手机控制',
        message: '选择手机可以访问的电脑地址',
        detail:
          '此入口默认关闭。手机和电脑需在同一网络，或通过 Tailscale 等私有网络连通。电脑和 DSH 必须保持运行；首次连接时，Windows 可能询问是否允许此应用通过防火墙。',
        buttons: [...addresses.map(address => `${address.startsWith('100.') ? 'Tailscale 私有网络（推荐外出使用）' : '本地网络（同一 Wi-Fi）'} · ${address}`), '取消'],
        defaultId: addresses.length,
        cancelId: addresses.length,
        noLink: true,
      })
      const address = addresses[selection.response]
      if (address === undefined || this.disposed) return
      await server.start(address)
      this.setDiscoveryEnabled(true)
      void this.refreshDiscovery().catch(() => { /* Manual LAN pairing remains available. */ })
    }
    const result = await dialog.showMessageBox({
      title: 'DSH 手机控制',
      message: '手机控制已开启',
      detail: `连接地址：${server.origin ?? ''}\n已授权设备：${String(server.devices.length)}\n\n关闭电脑或退出 DSH 后手机无法访问。当前不提供手机后台推送通知。`,
      buttons: ['配对手机', '管理已授权设备', '关闭手机控制', '关闭面板'],
      defaultId: 3,
      cancelId: 3,
      noLink: true,
    })
    if (this.isDisposed()) return
    if (result.response === 0) {
      const code = server.pairingCode()
      const choice = await dialog.showMessageBox({
        title: '配对 Android 手机',
        message: '在手机 DSH 中粘贴配对码',
        detail: '配对码 5 分钟内有效，只能使用一次。粘贴到手机后，还需要在本电脑确认设备名称。\n\n请勿将配对码发给他人。',
        buttons: ['显示二维码', '复制配对码', '取消'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      })
      if (choice.response === 0) await showPairingQr(code)
      if (choice.response === 1) await clipboard.writeText(code)
    } else if (result.response === 1) {
      const devices = server.devices
      if (devices.length === 0) {
        await dialog.showMessageBox({ title: '已授权设备', message: '尚未配对手机' })
        return
      }
      const selected = await dialog.showMessageBox({
        title: '已授权设备',
        message: '选择需要撤销的手机',
        detail: '撤销后会立即断开此设备，后续访问需要重新配对。',
        buttons: [...devices.map(device => device.label), '取消'],
        defaultId: devices.length,
        cancelId: devices.length,
        noLink: true,
      })
      const device = devices[selected.response]
      if (device !== undefined) server.revoke(device.id)
    } else if (result.response === 2) {
      this.setDiscoveryEnabled(false)
      clearTimeout(this.discoveryTimer)
      await this.discovery?.stop(); this.discovery = undefined
      await server.stop()
    }
  }
  /** Close listeners and streams; remember whether the next launch should restore the listener. */
  async dispose(): Promise<void> {
    this.disposed = true
    clearTimeout(this.discoveryTimer)
    await this.discoveryWork?.catch((error: unknown) => { void error /* Discovery may already be unavailable during shutdown. */ })
    await this.discovery?.stop()
    await (await this.server)?.dispose()
  }
}
