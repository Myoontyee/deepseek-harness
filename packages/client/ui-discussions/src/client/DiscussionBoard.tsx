/** A parent's persistent topic index and an explicitly opened native child conversation. */
import { useEffect, useState } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ResponseAnnotation } from '@deepseek-ai/dsh-client-ui-primitives'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DiscussionAssistant, DiscussionTopic } from '@deepseek-ai/dsh-api-discussion-controller/types'
import css from './Discussions.module.css'

/** Operations bound to the parent Session shown in this tab. */
export interface DiscussionBoardActions {
  list: () => Promise<DiscussionTopic[]>
  assistants: () => Promise<DiscussionAssistant[]>
  create: (assistant: DiscussionAssistant, title: string, quote: ResponseAnnotation | undefined) => Promise<DiscussionTopic>
  retain: (topic: DiscussionTopic) => SessionReference
  changeState: (topic: DiscussionTopic, state: DiscussionTopic['state']) => Promise<DiscussionTopic>
  openParent: () => void
  hooks: { quote: HostObservable<ResponseAnnotation | undefined> }
}

/** @param props - Parent-scoped actions and native conversation slot. @returns A durable discussion board. */
export function DiscussionBoard({ list, assistants, create, retain, changeState, openParent, useQuote,
  SessionProvider, renderSlot, inputActions, t }:
  PropsRuntime<'discussion.board'> & PropsLocale<'discussions'> & InjectFace<DiscussionBoardActions>
  & PropsRenderSlots<'discussion.conversation'>) {
  const [topics, setTopics] = useState<DiscussionTopic[]>([]), [members, setMembers] = useState<DiscussionAssistant[]>([])
  const [selected, setSelected] = useState<DiscussionTopic>(), [reference, setReference] = useState<SessionReference>()
  const [title, setTitle] = useState(''), [assistantId, setAssistantId] = useState(''), [conclusion, setConclusion] = useState('')
  const quote = useQuote(value => value)
  useEffect(() => { if (quote) setSelected(undefined) }, [quote])
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [returned, setReturned] = useState(false)
  useEffect(() => { let live = true
    void Promise.all([list(), assistants()]).then(([rows, profiles]) => {
      if (live) { setTopics(rows); setMembers(profiles); setAssistantId(profiles[0]?.id ?? '') }
    }, (failure) => { if (live) setError(String(failure)) })
    return () => { live = false }
  }, [list, assistants])
  useEffect(() => {
    setReference(undefined)
    if (!selected) return
    let live = true
    const next = retain(selected)
    void next.ready.then(() => { if (live) setReference(next) }, (failure) => { if (live) setError(String(failure)) })
    return () => { live = false; next.release() }
  }, [selected?.id, retain])
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(true); setError('')
    try { await action() } catch (failure) { setError(String(failure)) } finally { setBusy(false) }
  }
  return <div className={selected ? css.chat : css.board}>
    {error && <p role="alert">{t('failed', { message: error })}</p>}
    {selected ? <>
      <div className={css.actions}><button type="button" onClick={() => { setSelected(undefined) }}>{t('back')}</button>
        <strong>{selected.title}</strong><button type="button" onClick={openParent}>{t('source')}</button></div>
      {selected.quote && <details className={css.quote} data-discussion-source>
        <summary>{t('quote')}</summary>
        <MarkdownText text={selected.quote} variant="compact"
          labels={{ code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }} />
      </details>}
      <div className={css.conversation}>{reference
        ? <SessionProvider session={reference}>{renderSlot('discussion.conversation', {})}</SessionProvider>
        : <p role="status">{t('loading')}</p>}</div>
      <div className={css.return}>
        <textarea aria-label={t('conclusion')} placeholder={t('conclusion')} value={conclusion}
          onChange={(event) => { setConclusion(event.target.value); setReturned(false) }} />
        <button type="button" disabled={!conclusion.trim()} onClick={() => {
          const text = `${conclusion}\n\n[${selected.title}](dsh://session/${encodeURIComponent(selected.sessionId)})`
          if (inputActions.insertText(text, inputActions.captureInsertion())) { setReturned(true); setConclusion('') }
        }}>{t('return')}</button>{returned && <span role="status">{t('returned')}</span>}
      </div>
    </> : <>
      <div className={css.actions}><h3>{t('board')}</h3><button type="button" disabled={busy}
        onClick={() => { void run(async () => { setTopics(await list()); setMembers(await assistants()) }) }}>{t('refresh')}</button></div>
      {topics.length === 0 && <p>{t('empty')}</p>}
      {topics.map(topic => <article key={topic.id} className={css.topic}>
        <button type="button" onClick={() => { setSelected(topic); setReturned(false) }}>{topic.title}</button> <small>{t(topic.state)}</small>
        <div className={css.actions}>{(['open', 'resolved', 'archived'] as const).filter(state => state !== topic.state).map(state =>
          <button key={state} type="button" disabled={busy} onClick={() => { void run(async () => {
            await changeState(topic, state); setTopics(await list())
          }) }}>{t(state === 'open' ? 'reopen' : state === 'resolved' ? 'resolve' : 'archive')}</button>)}</div>
      </article>)}
      {members.length === 0 ? <p>{t('noAssistant')}</p> : <fieldset disabled={busy}>
        <label>{t('title')}<input value={title} maxLength={180} onChange={(e) => { setTitle(e.target.value) }} /></label>
        <label>{t('choose')}<select value={assistantId} onChange={(e) => { setAssistantId(e.target.value) }}>
          {members.filter(member => !member.archived).map(member =>
            <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        {quote && <details className={css.quote}><summary>{t('quote')}</summary>
          <MarkdownText text={quote.text} variant="compact"
            labels={{ code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }} />
        </details>}
        <button type="button" disabled={!title.trim()} onClick={() => { void run(async () => {
          const member = members.find(value => value.id === assistantId)
          if (!member) return
          const topic = await create(member, title, quote); setTopics(await list()); setSelected(topic); setTitle('')
        }) }}>{t('create')}</button>
      </fieldset>}
    </>}
  </div>
}
