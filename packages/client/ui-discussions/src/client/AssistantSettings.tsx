/** Explicitly managed identities and memories, separate from transcript retention. */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AssistantDraft, AssistantMemory, DiscussionAssistant, MemoryDraft } from '@deepseek-ai/dsh-api-discussion-controller/types'
import css from './Discussions.module.css'

/** Typed settings operations; errors remain visible without clearing drafts. */
export interface AssistantSettingsActions {
  listAssistants: () => Promise<DiscussionAssistant[]>
  saveAssistant: (current: DiscussionAssistant | undefined, draft: AssistantDraft) => Promise<DiscussionAssistant>
  listMemories: (assistant: DiscussionAssistant) => Promise<AssistantMemory[]>
  remember: (draft: MemoryDraft) => Promise<AssistantMemory>
  updateMemory: (memory: AssistantMemory, draft: MemoryDraft) => Promise<AssistantMemory>
  forget: (memory: AssistantMemory) => Promise<boolean>
}
const blank: AssistantDraft = { name: '', instructions: '', template: 'temporary', memoryMode: 'off' }

/** @param props - Native persistent assistant actions and localized copy. @returns The assistant and memory settings panel. */
export function AssistantSettings({ listAssistants, saveAssistant, listMemories, remember, updateMemory, forget, t }:
  PropsLocale<'discussions'> & InjectFace<AssistantSettingsActions>) {
  const [rows, setRows] = useState<DiscussionAssistant[]>([])
  const [current, setCurrent] = useState<DiscussionAssistant>()
  const [draft, setDraft] = useState<AssistantDraft>(blank)
  const [memories, setMemories] = useState<AssistantMemory[]>([])
  const [editingMemory, setEditingMemory] = useState<AssistantMemory>()
  const [text, setText] = useState(''), [project, setProject] = useState('')
  const [scope, setScope] = useState<MemoryDraft['scope']>('assistant')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { let live = true
    void listAssistants().then((value) => { if (live) setRows(value) }, (failure) => { if (live) setError(String(failure)) })
    return () => { live = false }
  }, [listAssistants])
  useEffect(() => { let live = true; setMemories([])
    if (current) void listMemories(current).then((value) => { if (live) setMemories(value) },
      (failure) => { if (live) setError(String(failure)) })
    return () => { live = false }
  }, [current, listMemories])
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(true); setError('')
    try { await action() } catch (failure) { setError(String(failure)) } finally { setBusy(false) }
  }
  return <div className={css.settings}>
    <p>{t('hint')}</p>{error && <p role="alert">{t('failed', { message: error })}</p>}
    <div className={css.list}>
      {rows.map(row => <button key={row.id} type="button" disabled={busy}
        onClick={() => { setCurrent(row); setDraft(row); setEditingMemory(undefined); setText('') }}>{row.name}</button>)}
      <button type="button" disabled={busy} onClick={() => { setCurrent(undefined); setDraft(blank) }}>{t('newAssistant')}</button>
    </div>
    <fieldset disabled={busy}>
      <label>{t('name')}<input value={draft.name} maxLength={120} onChange={(e) => { setDraft({ ...draft, name: e.target.value }) }} /></label>
      <label>{t('template')}<select aria-label={t('template')} value={draft.template} onChange={(e) => {
        const template = e.target.value
        if (template === 'temporary' || template === 'project' || template === 'resident') {
          setDraft({ ...draft, template, memoryMode: template === 'temporary' ? 'off' : template === 'project' ? 'project' : 'assistant' })
        }
      }}>{(['temporary', 'project', 'resident'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      <label>{t('duties')}<textarea value={draft.instructions} maxLength={12000}
        onChange={(e) => { setDraft({ ...draft, instructions: e.target.value }) }} /></label>
      <label>{t('memoryPolicy')}<select aria-label={t('memoryPolicy')} value={draft.memoryMode} onChange={(e) => {
        const mode = e.target.value
        if (mode === 'off' || mode === 'project' || mode === 'assistant') setDraft({ ...draft, memoryMode: mode })
      }}><option value="off">{t('off')}</option><option value="project">{t('projectMemory')}</option>
        <option value="assistant">{t('assistantMemory')}</option></select></label>
      <button type="button" disabled={!draft.name.trim()} onClick={() => { void run(async () => {
        const saved = await saveAssistant(current, draft); setCurrent(saved); setDraft(saved); setRows(await listAssistants())
      }) }}>{t(busy ? 'saving' : 'save')}</button>
    </fieldset>
    {current && <fieldset disabled={busy}><legend>{t('memory')}</legend>
      {memories.map(memory => <article key={memory.id}><p>{memory.text}</p><small>{memory.project || t('global')}</small>
        <button type="button" onClick={() => {
          setEditingMemory(memory); setText(memory.text); setScope(memory.scope); setProject(memory.project)
        }}>{t('editMemory')}</button>
        <button type="button" onClick={() => { void run(async () => { await forget(memory); setMemories(await listMemories(current)) }) }}>{t('forget')}</button>
      </article>)}
      <label>{t('scope')}<select value={scope} onChange={(e) => { setScope(e.target.value === 'project' ? 'project' : 'assistant') }}>
        <option value="assistant">{t('global')}</option><option value="project">{t('projectOnly')}</option></select></label>
      {scope === 'project' && <label>{t('projectPath')}<input value={project} onChange={(e) => { setProject(e.target.value) }} /></label>}
      <label>{t('memoryText')}<textarea value={text} maxLength={12000} onChange={(e) => { setText(e.target.value) }} /></label>
      <button type="button" disabled={!text.trim() || (scope === 'project' && !project.trim())} onClick={() => { void run(async () => {
        const value = { assistantId: current.id, scope, project: scope === 'project' ? project.trim() : '', text }
        if (editingMemory) await updateMemory(editingMemory, value)
        else await remember(value)
        setText(''); setEditingMemory(undefined); setMemories(await listMemories(current))
      }) }}>{t('remember')}</button>
      {editingMemory && <button type="button" onClick={() => { setEditingMemory(undefined); setText('') }}>{t('cancelEdit')}</button>}
    </fieldset>}
  </div>
}
