/** A local-only QR presentation; no pairing secret is sent to an image service. */
import { BrowserWindow } from 'electron'
import QRCode from 'qrcode'

/** Display a five-minute pairing invitation without enabling renderer scripts or native APIs. */
export async function showPairingQr(code: string): Promise<void> {
  const image = await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', width: 360, margin: 4 })
  const window = new BrowserWindow({ width: 460, height: 560, title: 'DSH · 扫码配对', autoHideMenuBar: true,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, javascript: false } })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => { event.preventDefault() })
  const html = '<!doctype html><html lang="zh"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'"><title>DSH 扫码配对</title><body style="font-family:system-ui;text-align:center;background:white;color:#222"><h2>打开手机 DSH，点击扫码连接</h2><img alt="一次性配对二维码" width="360" height="360" src="' + image + '"><p>五分钟内有效，只能使用一次。<br>扫码后仍需在本电脑确认授权。</p></body></html>'
  try { await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)) }
  catch (error) { window.destroy(); throw error }
  const timer = setTimeout(() => { if (!window.isDestroyed()) window.close() }, 5 * 60000)
  await new Promise<void>((resolve) => { window.once('closed', () => { clearTimeout(timer); resolve() }) })
}
