/** Addressed Session messages use the shared row menu and an independent overlay. */
import { useRef, useState } from 'react'
import { Button, Checkbox, IconLinkOutlineRegular, Menu, MenuItemButton, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SessionMenuItemProps, SessionRelayMenuInjected, SessionRelayDialogProps, SessionRelayTarget } from '../contract/slots.ts'
import css from './SessionRelay.module.css'

/**
 * Open an addressed-message dialog for the row's Session.
 * @param props - selected row, menu state, locale, and request callback.
 * @returns a menu item disabled for archived Sessions.
 */
export function SessionRelayMenuItem({
  sessionId, displayTitle, useMenuOpenState, useWorkspaces, useSessions, requestRelay, t,
}: SessionMenuItemProps<SessionRelayMenuInjected>) {
  const [, setOpen] = useMenuOpenState()
  const archived = useWorkspaces(state => state.archivedSessionIds.includes(sessionId))
  const subagent = useSessions(state => state.byId[sessionId]?.origin === 'subagent')
  return <MenuItemButton separatorBefore disabled={archived || subagent} icon={<IconLinkOutlineRegular />} onSelect={() => {
    setOpen(false)
    requestRelay(sessionId, displayTitle)
  }}>{t('relay.menu')}</MenuItemButton>
}

/**
 * Keep the message draft alive independently of its originating context menu.
 * @param props - pending request, Session catalog, delivery operation, and locale.
 * @returns the dialog for the selected target, or null.
 */
export function SessionRelayDialog(props: SessionRelayDialogProps) {
  const target = props.useRelayRequest(value => value)
  if (!target) return null
  return <RelayForm key={target.sessionId} {...props} target={target} />
}

function RelayForm({
  target, useSessions, useWorkspaces, closeRelay, sendRelay, t,
}: SessionRelayDialogProps & { target: SessionRelayTarget }) {
  const catalog = useSessions(value => value.byId)
  const archived = useWorkspaces(value => value.archivedSessionIds)
  const candidates = Object.values(catalog).filter(item => item.id !== target.sessionId
    && item.origin !== 'subagent' && !archived.includes(item.id))
  const [source, setSource] = useState<SessionId | undefined>()
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState(true)
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(randomUUID())
  const sourceRow = candidates.find(item => item.id === source)
  const changed = () => { requestId.current = randomUUID(); setError(null) }
  const close = () => { if (!busy) closeRelay() }
  const send = async () => {
    if (busy || !sourceRow || !message.trim()) return
    setBusy(true)
    setError(null)
    try {
      await sendRelay(sourceRow.id, target.sessionId, message, reply, requestId.current)
      closeRelay()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  return <Modal open title={t('relay.title')} closeLabel={t('close')} onClose={close} footer={<>
    <Button variant="outline" disabled={busy} onClick={close}>{t('cancel')}</Button>
    <Button variant="primary" disabled={busy || !sourceRow || !message.trim()} onClick={() => { void send() }}>{t('relay.send')}</Button>
  </>}>
    <div className={css.form}>
      <div>{t('relay.to', { title: target.title || target.sessionId })}</div>
      <label>{t('relay.from')}</label>
      <Menu open={menu} portal onClose={() => { setMenu(false) }}
        anchor={<Button variant="outline" disabled={busy || !candidates.length} onClick={() => { setMenu(!menu) }}>{sourceRow?.title || sourceRow?.id || t('relay.choose')}</Button>}
        items={candidates.map(item => ({ id: item.id, label: item.title || item.id }))}
        selectedId={source} onSelect={(id) => {
          const selected = candidates.find(item => item.id === id)
          if (selected) { setSource(selected.id); changed() }
          setMenu(false)
        }} />
      {!candidates.length && <div role="status">{t('relay.none')}</div>}
      <label htmlFor="session-relay-message">{t('relay.message')}</label>
      <textarea id="session-relay-message" className={css.message} value={message} disabled={busy} maxLength={16000}
        placeholder={t('relay.placeholder')} data-modal-autofocus onChange={(event) => { setMessage(event.target.value); changed() }} />
      <Checkbox checked={reply} disabled={busy} label={t('relay.reply')} onChange={(value) => { setReply(value); changed() }} />
      <p className={css.hint}>{t('relay.hint')}</p>
      {error && <div className={css.error} role="alert">{error}</div>}
    </div>
  </Modal>
}
