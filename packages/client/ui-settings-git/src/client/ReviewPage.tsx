/** Persistent repository review configuration and explicit review admission. */
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { useEffect, useRef, useState } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitWorkspace } from '@deepseek-ai/dsh-api-git-controller/types'
import type { ReviewPreferences, ReviewReceipt, ReviewRequest } from '@deepseek-ai/dsh-api-code-review-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** Review callbacks independent of the Host and session-navigation implementation. */
export interface ReviewPageActions {
  workspaces: () => Promise<GitWorkspace[]>
  hooks: { preferences: ObservableSnapshot<ReturnType<ConfigForm<ReviewPreferences>['getSnapshot']>> }
  mutatePreferences: ConfigForm<ReviewPreferences>['mutate']
  start: (request: ReviewRequest, signal: AbortSignal) => Promise<ReviewReceipt>
  open: (id: SessionId) => void
  notify: (text: string, success: boolean) => void
}
/** Composed review settings props. */
export type ReviewPageProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.git'> & InjectFace<ReviewPageActions>
/**
 * Render saved model/criteria choices and start a dedicated review conversation.
 * @param props - localized callbacks, persistent form and panel close action.
 * @returns review settings UI.
 */
export function ReviewPage({ t, usePreferences, mutatePreferences, workspaces, start, open, notify, close }: ReviewPageProps) {
  const settings = usePreferences(value => value)
  const [projects, setProjects] = useState<GitWorkspace[]>([])
  const [id, setId] = useState<WorkspaceId | undefined>()
  const [kind, setKind] = useState<'working' | 'branch' | 'pull-request'>('working')
  const [base, setBase] = useState('')
  const [number, setNumber] = useState('')
  const [focus, setFocus] = useState('')
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const mounted = useRef(true)
  const active = useRef<AbortController | undefined>()
  const pending = useRef<{ input: string; requestId: string } | undefined>()
  useEffect(() => {
    let current = true
    mounted.current = true
    workspaces().then(
      (rows) => {
        if (current) {
          setProjects(rows)
          setId(rows[0]?.id)
        }
      },
      (error: unknown) => {
        if (current) setFailure(String(error))
      },
    )
    return () => {
      current = false
      mounted.current = false
      active.current?.abort()
    }
  }, [workspaces])
  const saved = id ? settings.value?.repositories[id] : undefined
  useEffect(() => {
    setBase(saved?.base ?? '')
    setFocus(saved?.focus ?? '')
    setProvider(saved?.provider ?? settings.value?.provider ?? '')
    setModel(saved?.model ?? settings.value?.model ?? '')
    setInstructions(saved?.instructions ?? settings.value?.instructions ?? '')
  }, [id, saved, settings.value?.provider, settings.value?.model, settings.value?.instructions])
  const persist = async () => {
    if (!id) return false
    return mutatePreferences([{ op: 'set', path: ['repositories', id], value: { provider, model, instructions, base, focus } }])
  }
  const save = async () => {
    setBusy(true)
    try {
      const accepted = await persist()
      notify(accepted ? t('saved') : t('savingUnavailable'), accepted)
    } catch (error) {
      notify(String(error), false)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  const begin = async () => {
    if (!id || busy) return
    const controller = new AbortController()
    active.current = controller
    setBusy(true)
    setFailure('')
    try {
      if (settings.writable && !(await persist())) throw new Error(t('saveReviewFirst'))
      controller.signal.throwIfAborted()
      const target: ReviewRequest['target'] =
        kind === 'working' ? { kind } : kind === 'branch' ? { kind, base } : { kind, number: Number(number) }
      const preferences = { provider, model, instructions }
      const input = JSON.stringify({ workspaceId: id, target, focus, preferences })
      if (pending.current?.input !== input) pending.current = { input, requestId: randomUUID() }
      const receipt = await start(
        { requestId: pending.current.requestId, workspaceId: id, target, focus, preferences },
        controller.signal,
      )
      if (controller.signal.aborted) return
      pending.current = undefined
      open(receipt.sessionId)
      close()
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      if (active.current === controller) active.current = undefined
      if (mounted.current && !controller.signal.aborted) setBusy(false)
    }
  }
  return (
    <section className="dsh-git-settings">
      <h2>{t('review')}</h2>
      <p>{t('reviewDescription')}</p>
      <fieldset disabled={busy || settings.status !== 'ready'}>
        <label className="row">
          {t('workspace')}
          <select
            value={id ?? ''}
            onChange={(event) => {
              setId(projects.find(project => project.id === event.target.value)?.id)
            }}
          >
            <option value="">{t('choose')}</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
        <div className="panel">
          <h3>{t('reviewScope')}</h3>
          <select
            aria-label={t('reviewScope')}
            value={kind}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'working' || value === 'branch' || value === 'pull-request') setKind(value)
            }}
          >
            <option value="working">{t('reviewWorking')}</option>
            <option value="branch">{t('reviewBranch')}</option>
            <option value="pull-request">{t('reviewPr')}</option>
          </select>
          {kind === 'branch' && (
            <input
              value={base}
              onChange={(event) => {
                setBase(event.target.value)
              }}
              aria-label={t('prBase')}
              placeholder={t('prBase')}
            />
          )}
          {kind === 'pull-request' && (
            <>
              <input
                type="number"
                min={1}
                value={number}
                onChange={(event) => {
                  setNumber(event.target.value)
                }}
                aria-label={t('prNumber')}
                placeholder={t('prNumber')}
              />
              <p>{t('reviewPrHint')}</p>
            </>
          )}
          <textarea
            value={focus}
            onChange={(event) => {
              setFocus(event.target.value)
            }}
            aria-label={t('reviewFocus')}
            placeholder={t('reviewFocus')}
          />
        </div>
        <div className="panel">
          <h3>{t('reviewModel')}</h3>
          <p>{t('reviewDefaultModel')}</p>
          <label className="row">
            {t('provider')}
            <input
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value)
              }}
            />
          </label>
          <label className="row">
            {t('model')}
            <input
              value={model}
              onChange={(event) => {
                setModel(event.target.value)
              }}
            />
          </label>
          <label>
            {t('reviewInstructions')}
            <textarea
              value={instructions}
              onChange={(event) => {
                setInstructions(event.target.value)
              }}
            />
          </label>
          <button disabled={!id || !settings.writable} onClick={() => void save()}>
            {t('save')}
          </button>
        </div>
        <button
          disabled={
            !id ||
            (kind === 'branch' && !base.trim()) ||
            (kind === 'pull-request' && (!Number.isSafeInteger(Number(number)) || Number(number) < 1))
          }
          onClick={() => void begin()}
        >
          {t('startReview')}
        </button>
      </fieldset>
      {busy && (
        <div className="row">
          <StateDot state="ongoing" />
          <button
            onClick={() => {
              active.current?.abort()
              setBusy(false)
            }}
          >
            {t('cancel')}
          </button>
        </div>
      )}
      {failure && (
        <div className="error" role="alert">
          {failure}
        </div>
      )}
    </section>
  )
}
