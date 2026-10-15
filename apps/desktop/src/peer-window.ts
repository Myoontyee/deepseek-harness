/** Isolated windows for explicitly paired computers, with no local preload privileges. */
import { BrowserWindow, session } from 'electron'
import { randomUUID } from 'node:crypto'
import { acceptsPeerCertificate } from './peer-transport.ts'

/** Open one remote conversation using only its device-scoped grant and pinned certificate. */
export async function openPeerWindow(
  grant: { id: string; name: string; url: string; pin: string; token: string }, sessionId: string,
): Promise<BrowserWindow> {
  const remote = session.fromPartition(`dsh-peer-${randomUUID()}`)
  const origin = new URL(grant.url)
  remote.setCertificateVerifyProc((request, callback) => {
    try {
      const matches = request.hostname === origin.hostname && acceptsPeerCertificate(Buffer.from(request.certificate.data), grant.pin)
      callback(matches ? 0 : -2)
    }
    catch { callback(-2) }
  })
  remote.setPermissionRequestHandler((_webContents, _permission, callback) => { callback(false) })
  remote.setPermissionCheckHandler(() => false)
  remote.webRequest.onBeforeRequest((details, callback) => {
    try { const url = new URL(details.url); callback({ cancel: url.origin !== origin.origin && !(url.protocol === 'wss:' && url.host === origin.host) && !['blob:', 'data:'].includes(url.protocol) }) }
    catch { callback({ cancel: true }) }
  })
  await remote.cookies.set({ url: origin.origin, name: '__Host-dsh-device', value: grant.token, secure: true, httpOnly: true, path: '/', sameSite: 'strict' })
  const window = new BrowserWindow({ width: 1280, height: 880, title: `${grant.name} · DSH`,
    webPreferences: { session: remote, sandbox: true, contextIsolation: true, nodeIntegration: false } })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-attach-webview', (event) => { event.preventDefault() })
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin.origin) event.preventDefault() })
  window.on('page-title-updated', (event) => { event.preventDefault(); window.setTitle(`${grant.name} · DSH`) })
  window.once('closed', () => { void remote.clearStorageData(); void remote.closeAllConnections() })
  try { await window.loadURL(origin.origin + '/#dsh-session=' + encodeURIComponent(sessionId)) }
  catch (error) { window.destroy(); throw error }
  return window
}
