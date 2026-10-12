/** User-facing skill catalog, installation review and reversible management. */
import { useEffect, useRef, useState } from 'react'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ManagedSkillCandidate, SkillManagementSnapshot, SkillInstallRequest } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SkillKey } from './locales.ts'
import css from './SkillsPage.module.css'

/** Plain callbacks supplied by the skill plugin's authenticated Host connection. */
export interface SkillsPageActions {
  snapshot(): Promise<SkillManagementSnapshot>
  discover(query: string): Promise<ManagedSkillCandidate[]>
  repositorySkills(repository: string): Promise<ManagedSkillCandidate[]>
  repositories(values: string[]): Promise<void>
  preview(request: SkillInstallRequest): Promise<string>
  install(request: SkillInstallRequest): Promise<void>
  importLocal(id: string): Promise<void>
  zipSkills(base64: string): Promise<ManagedSkillCandidate[]>
  previewZip(base64: string, path: string): Promise<string>
  installZip(base64: string, path: string): Promise<void>
  manage(id: string, action: 'enable' | 'disable' | 'remove' | 'restore'): Promise<void>
  updates(): Promise<Array<{ id: string; revision: string }>>
  refresh(): Promise<void>
  copy(value: string): void
}
type Props = PropsRuntime<'settings.section'> & PropsLocale<'skill'> & InjectFace<SkillsPageActions>

/**
 * Render skill settings and installation review.
 * @param props - Scoped settings labels and authenticated actions.
 * @returns Skill settings and installation review.
 */
export function SkillsPage(props: Props) {
  const { t } = props
  const [state, setState] = useState<SkillManagementSnapshot>({ installed: [], local: [], repositories: [] })
  const [tab, setTab] = useState<'installed' | 'market' | 'repositories' | 'local' | 'backups'>('installed')
  const [query, setQuery] = useState('')
  const [repo, setRepo] = useState('')
  const [sources, setSources] = useState('')
  const [items, setItems] = useState<ManagedSkillCandidate[]>([])
  const [selected, setSelected] = useState<ManagedSkillCandidate | undefined>()
  const [document, setDocument] = useState('')
  const [archive, setArchive] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [updates, setUpdates] = useState<string[]>([])
  const live = useRef(true)
  const file = useRef<HTMLInputElement>(null)
  const load = async (): Promise<void> => {
    const value = await props.snapshot()
    if (live.current) { setState(value); setSources(value.repositories.join('\n')) }
  }
  useEffect(() => {
    live.current = true
    void load().catch((error) => { if (live.current) setError(String(error)) })
    return () => { live.current = false }
  }, [])
  const perform = async (action: () => Promise<void>, reload = false): Promise<void> => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await action(); if (reload) { await load(); if (live.current) setNotice(t('settingsApplied')) } }
    catch (error) { if (live.current) setError(error instanceof Error ? error.message : String(error)) }
    finally { if (live.current) setBusy(false) }
  }
  const coordinates = (item: ManagedSkillCandidate): SkillInstallRequest => {
    if (item.repository === undefined || item.revision === undefined) throw new Error(t('settingsReviewFirst'))
    return { repository: item.repository, revision: item.revision, path: item.path }
  }
  const inspect = async (item: ManagedSkillCandidate): Promise<void> => {
    if (item.source === 'zip') {
      if (archive === undefined) throw new Error(t('settingsSelectZip'))
      const text = await props.previewZip(archive, item.path)
      setSelected(item); setDocument(text); return
    }
    if (item.revision === undefined && item.repository !== undefined) {
      const found = await props.repositorySkills(item.repository)
      const matches = found.filter(candidate => candidate.name === item.path || candidate.name === item.name)
      setItems(matches.length > 0 ? matches : found); setArchive(undefined)
      if (matches.length === 1 && matches[0] !== undefined) await inspect(matches[0])
      return
    }
    const content = await props.preview(coordinates(item))
    if (live.current) { setSelected(item); setDocument(content) }
  }
  const install = async (): Promise<void> => {
    if (selected === undefined) return
    if (selected.source === 'zip') {
      if (archive === undefined) throw new Error(t('settingsSelectZip'))
      await props.installZip(archive, selected.path)
    } else await props.install(coordinates(selected))
    setSelected(undefined)
  }
  const zip = async (value: File): Promise<void> => {
    if (value.size > 8 * 1024 * 1024) throw new Error(t('settingsZipLimit'))
    const bytes = new Uint8Array(await value.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
    const base64 = btoa(binary)
    const found = await props.zipSkills(base64)
    setArchive(base64); setItems(found); setSelected(undefined); setTab('market')
  }
  const installed = state.installed.filter(item => (tab === 'backups' ? item.removed || item.backup !== undefined : !item.removed)
    && `${item.name} ${item.description} ${item.source}`.toLowerCase().includes(query.toLowerCase()))
  const local = state.local.filter(item => `${item.name} ${item.description} ${item.source}`.toLowerCase().includes(query.toLowerCase()))
  const button = (label: SkillKey, action: () => Promise<void>, reload = false) =>
    <button type="button" disabled={busy} onClick={() => { void perform(action, reload) }}>{t(label)}</button>
  return <section className={css.page} aria-label={t('settingsNav')}>
    <div className={css.header}><div><h2>{t('settingsNav')}</h2><p>{t('settingsIntro')}</p></div>
      <div className={css.actions}>
        {button('settingsRefresh', () => props.refresh(), true)}
        {button('settingsCheckUpdates', async () => { const values = await props.updates(); setUpdates(values.map(item => item.id)); setNotice(t('settingsUpdateCount', { count: values.length })) })}
        <button type="button" disabled={busy} onClick={() => file.current?.click()}>{t('settingsZip')}</button>
        <input ref={file} type="file" accept=".zip" hidden onChange={(event) => {
          const value = event.target.files?.[0]; event.target.value = ''
          if (value !== undefined) void perform(() => zip(value))
        }} />
      </div>
    </div>
    <nav className={css.tabs} aria-label={t('settingsNav')}>
      {(['installed', 'market', 'repositories', 'local', 'backups'] as const).map(key =>
        <button type="button" key={key} disabled={busy} aria-pressed={tab === key}
          onClick={() => { setTab(key); setQuery(''); setSelected(undefined) }}>{t(`settingsTab.${key}`)}</button>)}
    </nav>
    <div className={css.search}><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('settingsSearch')}
      aria-label={t('settingsSearch')} onKeyDown={(event) => { if (event.key === 'Enter' && tab === 'market') void perform(async () => { setArchive(undefined); setItems(await props.discover(query)); setSelected(undefined) }) }} />
    {tab === 'market' && button('settingsSearchButton', async () => { setArchive(undefined); setItems(await props.discover(query)); setSelected(undefined) })}
    </div>
    {error !== '' && <p role="alert" className={css.error}>{error}</p>}
    {notice !== '' && <p role="status">{notice}</p>}
    {busy && <p role="status">{t('settingsWorking')}</p>}
    {tab === 'repositories' && <div className={css.card}>
      <label>{t('settingsRepository')}<input value={repo} onChange={event => setRepo(event.target.value)} placeholder="owner/repository" /></label>
      <div className={css.actions}>{button('settingsBrowseRepo', async () => { setItems(await props.repositorySkills(repo)); setArchive(undefined); setSelected(undefined); setTab('market') })}</div>
      <label>{t('settingsRepositoryList')}<textarea value={sources} onChange={event => setSources(event.target.value)} rows={5} /></label>
      {button('settingsSaveSources', () => props.repositories(sources.split(/\r?\n/u).map(value => value.trim()).filter(Boolean)), true)}
      <div className={css.actions}>{state.repositories.map(value => <button type="button" key={value} disabled={busy}
        onClick={() => { void perform(async () => { setItems(await props.repositorySkills(value)); setArchive(undefined); setSelected(undefined); setTab('market') }) }}>{value}</button>)}</div>
    </div>}
    {(tab === 'installed' || tab === 'backups') && <div className={css.list}>
      {installed.length === 0 && <p>{t('settingsEmpty')}</p>}
      {installed.map(item => <article className={css.card} key={item.id}>
        <div className={css.row}><strong>{item.name}</strong><span>{t(item.removed ? 'settingsRemoved' : item.enabled ? 'settingsEnabled' : 'settingsDisabled')}</span></div>
        <p>{item.description}</p><small>{item.source}{item.revision ? ` · ${item.revision.slice(0, 8)}` : ''}</small>
        <div className={css.actions}>
          {!item.removed && <>{button(item.enabled ? 'settingsDisable' : 'settingsEnable', () => props.manage(item.id, item.enabled ? 'disable' : 'enable'), true)}
            {button('settingsRemove', () => props.manage(item.id, 'remove'), true)}</>}
          {item.backup !== undefined && button('settingsRestore', () => props.manage(item.id, 'restore'), true)}
          {updates.includes(item.id) && item.repository !== undefined && button('settingsUpdate', async () => {
            const found = await props.repositorySkills(item.repository ?? '')
            setItems(found.filter(candidate => candidate.name === item.name)); setArchive(undefined); setTab('market')
          })}
        </div>
      </article>)}
    </div>}
    {tab === 'local' && <><p>{t('settingsImportHint')}</p><div className={css.list}>
      {local.length === 0 && <p>{t('settingsEmpty')}</p>}
      {local.map(item => <article className={css.card} key={item.id}><strong>{item.name}</strong><small> · {item.source}</small>
        <p>{item.description}</p>{button('settingsImport', () => props.importLocal(item.id), true)}</article>)}
    </div></>}
    {tab === 'market' && <><p>{archive === undefined ? t('settingsMarketHint') : t('settingsArchiveHint')}</p><div className={css.grid}>
      {items.map(item => <article className={css.card} key={item.id}><strong>{item.name}</strong><p>{item.description}</p>
        <small>{item.repository ?? item.source}{item.installs === undefined ? '' : ` · ${item.installs}`}</small>
        <div className={css.actions}>{button('settingsView', () => inspect(item))}
          {item.repository !== undefined && <button type="button" onClick={() => props.copy(`https://github.com/${item.repository}`)}>{t('settingsCopySource')}</button>}</div>
      </article>)}
    </div></>}
    {selected !== undefined && <section className={css.review} aria-label={t('settingsReview')}>
      <h3>{t('settingsReview')} · {selected.name}</h3><p>{selected.repository ?? selected.source} · {selected.path}</p>
      <p>{t('settingsInstallHint')}</p><pre>{document}</pre>
      <div className={css.actions}>{button('settingsInstall', install, true)}<button type="button" disabled={busy} onClick={() => setSelected(undefined)}>{t('settingsClose')}</button></div>
    </section>}
  </section>
}
