import icons from 'virtual:phone-icons'
import { connectionCopy as t } from './connection-copy'
type Device = { id: string; name: string; os?: string; online: boolean; ready: boolean; authorized: boolean }
type State = {
  type: string
  state: string
  devices: Device[]
  autoReconnect: boolean
  phoneSync: boolean
  error?: string
  notice?: string
  busy?: boolean
}
export function connections(send: (action: string, fields?: Record<string, unknown>) => void) {
  const dialog = document.createElement('dialog'); dialog.className = 'connections'; dialog.setAttribute('aria-label', t.title)
  const head = document.createElement('div'); head.className = 'connections-heading'
  const title = document.createElement('h2'); title.textContent = t.title
  const close = document.createElement('button'); close.className = 'icon-button'; close.setAttribute('aria-label', t.close); close.innerHTML = icons.close; close.onclick = () => dialog.close()
  head.append(title, close)
  const intro = document.createElement('p'); intro.className = 'connections-description'; intro.textContent = t.description
  const status = document.createElement('p'); status.className = 'connections-status'; status.setAttribute('role', 'status')
  const actions = document.createElement('div'); actions.className = 'connections-actions'
  const action = (label: string, operation: string) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => request(operation); return b }
  const refresh = action(t.refresh, 'status'), login = action(t.login, 'login'); actions.append(refresh, login)
  const rows = document.createElement('div'); rows.className = 'connection-devices'
  const preferences = document.createElement('div'); preferences.className = 'connection-preferences'
  const toggle = (label: string, operation: string) => { const row = document.createElement('label'), box = document.createElement('input'), text = document.createElement('span'); box.type = 'checkbox'; box.setAttribute('role', 'switch'); text.textContent = label; box.onchange = () => request(operation, { enabled: box.checked }); row.append(text, box); preferences.append(row); return box }
  const auto = toggle(t.auto, 'autoReconnect'), sync = toggle(t.sync, 'phoneSync')
  const secondary = document.createElement('div'); secondary.className = 'connections-actions secondary'
  const account = action(t.account, 'account'), advanced = action(t.advanced, 'advanced'); secondary.append(account, advanced)
  dialog.append(head, intro, status, actions, rows, preferences, secondary); document.body.append(dialog)
  let timer: ReturnType<typeof setTimeout> | undefined, pending = false, returnFocus: HTMLElement | null = null
  function request(operation: string, fields: Record<string, unknown> = {}) {
    clearTimeout(timer); pending = true; refresh.disabled = true; login.disabled = true
    status.textContent = operation === 'pair' ? t.waiting : t.busy
    send('devices', { operation, ...fields })
  }
  dialog.addEventListener('close', () => { clearTimeout(timer); returnFocus?.focus() })
  document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden && dialog.open && !pending) request('status') })
  return {
    open() { returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; if (!dialog.open) dialog.showModal(); request('status') },
    update(state: State) {
      pending = false; refresh.disabled = false; login.disabled = false
      status.textContent = state.error || state.notice || (state.state === 'Running' ? t.online : t.notSignedIn)
      status.classList.toggle('error', Boolean(state.error)); login.hidden = state.state === 'Running'
      auto.checked = state.autoReconnect; sync.checked = state.phoneSync
      rows.replaceChildren()
      if (!state.devices.length) { const empty = document.createElement('p'); empty.className = 'connections-description'; empty.textContent = t.empty; rows.append(empty) }
      for (const device of state.devices) {
        const card = document.createElement('div'); card.className = 'connection-card'
        const icon = document.createElement('span'); icon.className = 'connection-globe'; icon.innerHTML = icons.globe
        const label = document.createElement('div'); label.className = 'connection-label'
        const name = document.createElement('strong'); name.textContent = device.name
        const detail = document.createElement('span'); detail.textContent = [device.os, !device.online ? t.offline : device.authorized ? t.connected : device.ready ? t.available : t.unavailable].filter(Boolean).join(' · ')
        label.append(name, detail)
        const controls = document.createElement('div'); controls.className = 'connection-controls'
        const open = document.createElement('button'); open.textContent = device.authorized ? t.open : t.pair
        open.disabled = !device.authorized && (!device.online || !device.ready)
        open.onclick = () => { if (device.authorized) { dialog.close(); send('showRemoteDevice', { device: device.id }) } else { open.disabled = true; request('pair', { device: device.id }) } }
        controls.append(open)
        if (device.authorized) { const renew = document.createElement('button'); renew.className = 'quiet'; renew.textContent = t.renew; renew.disabled = !device.online || !device.ready; renew.onclick = () => { if (confirm(`${t.renew}：${device.name}？`)) request('pair', { device: device.id }) }; controls.append(renew) }
        card.append(icon, label, controls); rows.append(card)
      }
      clearTimeout(timer); if (dialog.open && !document.hidden) timer = setTimeout(() => request('status'), 15000)
    },
  }
}
