/** Git repository controls with retained state and request-generation fencing. */
import { useEffect, useRef, useState } from 'react'
import { StateDot, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {
  GitBranch,
  GitCommit,
  GitDiff,
  GitMutation,
  GitPreferences,
  GitPullRequest,
  GitStatus,
  GitWorkspace,
  GithubAccount,
  GithubLoginState,
} from '@deepseek-ai/dsh-api-git-controller/types'

/** Operations injected by the browser plugin, with no Host context in the component. */
export interface GitPageActions {
  workspaces: () => Promise<GitWorkspace[]>
  status: (id: WorkspaceId) => Promise<GitStatus>
  history: (id: WorkspaceId) => Promise<GitCommit[]>
  branches: (id: WorkspaceId) => Promise<GitBranch[]>
  diff: (id: WorkspaceId, path: string, staged: boolean) => Promise<GitDiff>
  stage: (id: WorkspaceId, paths: string[], revision: string) => Promise<GitMutation>
  unstage: (id: WorkspaceId, paths: string[], revision: string) => Promise<GitMutation>
  commit: (id: WorkspaceId, message: string, revision: string) => Promise<GitMutation>
  switchBranch: (id: WorkspaceId, branch: string, create: boolean, revision: string) => Promise<GitMutation>
  network: (id: WorkspaceId, action: 'fetch' | 'pull' | 'push', revision: string) => Promise<GitMutation>
  account: (id: WorkspaceId) => Promise<GithubAccount>
  pulls: (id: WorkspaceId) => Promise<GitPullRequest[]>
  login: (id: WorkspaceId, signal: AbortSignal) => AsyncIterable<GithubLoginState>
  createPr: (id: WorkspaceId, title: string, body: string, base: string, revision: string) => Promise<GitMutation>
  checkoutPr: (id: WorkspaceId, number: number, revision: string) => Promise<GitMutation>
  mergePr: (id: WorkspaceId, number: number, head: string) => Promise<string>
  hooks: { preferences: ObservableSnapshot<ReturnType<ConfigForm<GitPreferences>['getSnapshot']>> }
  setPreference: ConfigForm<GitPreferences>['set']
  notify: (text: string, success: boolean) => void
}
/** Composed Git settings page props. */
export type GitPageProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.git'> & InjectFace<GitPageActions>

/**
 * Render the project selector, Git controls and persistent preferences.
 * @param props - localized callbacks and settings form.
 * @returns the Git management page.
 */
export function GitPage(props: GitPageProps) {
  const { t } = props
  const settings = props.usePreferences(value => value)
  const [projects, setProjects] = useState<GitWorkspace[]>([])
  const [id, setId] = useState<WorkspaceId | undefined>()
  const [status, setStatus] = useState<GitStatus | undefined>()
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [path, setPath] = useState<string | undefined>()
  const [staged, setStaged] = useState(false)
  const [diff, setDiff] = useState<GitDiff | undefined>()
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [branch, setBranch] = useState('')
  const [account, setAccount] = useState<GithubAccount | undefined>()
  const [pulls, setPulls] = useState<GitPullRequest[] | undefined>()
  const [prefix, setPrefix] = useState('')
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [prBase, setPrBase] = useState('')
  const [mergeTarget, setMergeTarget] = useState<GitPullRequest | null>(null)
  const [loginState, setLoginState] = useState<GithubLoginState | null>(null)
  const loginController = useRef<AbortController | undefined>()
  const generation = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current++
      loginController.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (settings.value) setPrefix(settings.value.branchPrefix)
  }, [settings.value?.branchPrefix])
  useEffect(() => {
    let current = true
    props.workspaces().then(
      (rows) => {
        if (current) {
          setProjects(rows)
          setId(rows[0]?.id)
        }
      },
      (failure: unknown) => {
        if (current) setError(String(failure))
      },
    )
    return () => {
      current = false
    }
  }, [props.workspaces])

  const refresh = async (target: WorkspaceId) => {
    const request = ++generation.current
    setLoading(true)
    try {
      const [state, history, localBranches] = await Promise.all([
        props.status(target),
        props.history(target),
        props.branches(target),
      ])
      if (!mounted.current || generation.current !== request) return
      setStatus(state)
      setCommits(history)
      setBranches(localBranches)
      setError('')
      setSelected(previous => previous.filter(file => state.changes.some(change => change.path === file)))
    } catch (failure) {
      if (mounted.current && generation.current === request)
        setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      if (mounted.current && generation.current === request) setLoading(false)
    }
  }
  useEffect(() => {
    setStatus(undefined)
    setCommits([])
    setBranches([])
    setSelected([])
    setPath(undefined)
    setDiff(undefined)
    setAccount(undefined)
    setPulls(undefined)
    if (id) void refresh(id)
    return () => {
      generation.current++
    }
  }, [id])
  useEffect(() => {
    let current = true
    setDiff(undefined)
    if (id && path)
      props.diff(id, path, staged).then(
        (value) => {
          if (current) setDiff(value)
        },
        (failure: unknown) => {
          if (current) setError(String(failure))
        },
      )
    return () => {
      current = false
    }
  }, [id, path, staged, status?.revision, props.diff])

  const operate = async (operation: () => Promise<GitMutation>, clearMessage = false) => {
    if (!id || busy) return
    const target = id
    setBusy(true)
    try {
      const response = await operation()
      const success = response.result.exitCode === 0 && !response.result.timedOut
      props.notify(success ? t('done') : response.result.stderr || t('failed'), success)
      if (mounted.current) {
        setStatus(response.status)
        if (success && clearMessage) setMessage('')
        await refresh(target)
      }
    } catch (failure) {
      props.notify(failure instanceof Error ? failure.message : String(failure), false)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  const save = async (field: keyof GitPreferences, value: string | boolean) => {
    setBusy(true)
    try {
      const accepted = await props.setPreference(field, value)
      props.notify(accepted ? t('saved') : t('savingUnavailable'), accepted)
    } catch (failure) {
      props.notify(String(failure), false)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  const loadGithub = async () => {
    if (!id) return
    setBusy(true)
    try {
      const next = await props.account(id)
      if (!mounted.current) return
      setAccount(next)
      if (next.authenticated) {
        const rows = await props.pulls(id) // Component lifetime may change while the PR request is awaiting.
        // oxlint-disable-next-line typescript/no-unnecessary-condition
        if (mounted.current) setPulls(rows)
      }
    } catch (failure) {
      props.notify(String(failure), false)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  const signIn = async () => {
    if (!id || loginController.current) return
    const controller = new AbortController()
    loginController.current = controller
    setLoginState({ status: 'starting' })
    try {
      for await (const frame of props.login(id, controller.signal)) {
        if (controller.signal.aborted || !mounted.current) break
        setLoginState(frame)
        if (frame.status === 'complete') {
          props.notify(t('signedIn'), true)
          await loadGithub()
        }
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        props.notify(String(failure), false)
        if (mounted.current) setLoginState({ status: 'failed', reason: 'login-failed' })
      }
    } finally {
      if (loginController.current === controller) loginController.current = undefined
    }
  }
  const closeLogin = () => {
    loginController.current?.abort()
    setLoginState(null)
  }
  const revision = status?.revision ?? ''
  const changedPaths = status?.changes.map(change => change.path) ?? []
  return (
    <section className="dsh-git-settings">
      <h2>{t('title')}</h2>
      <div className="row">
        <label>
          {t('workspace')}
          <select
            disabled={busy}
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
        <button
          disabled={!id || busy || loading}
          onClick={() => {
            if (id) void refresh(id)
          }}
        >
          {t('refresh')}
        </button>
      </div>
      {projects.length === 0 && <p>{t('noProjects')}</p>}
      {error && (
        <div className="error" role="alert">
          {t('notRepository')}: {error}
        </div>
      )}
      {loading && !status && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <StateDot state="ongoing" size={24} />
        </div>
      )}
      {status && id && (
        <fieldset disabled={busy || loading}>
          <div className="path">{status.root}</div>
          <div className="row" aria-label={t('status')}>
            <strong>{status.branch ?? t('detached')}</strong>
            <span>
              ↑ {status.ahead} · ↓ {status.behind}
            </span>
            {(['fetch', 'pull', 'push'] as const).map(action => (
              <button key={action} onClick={() => void operate(() => props.network(id, action, revision))}>
                {t(action === 'push' && !status.upstream ? 'publish' : action)}
              </button>
            ))}
          </div>
          <div className="row">
            <label>
              {t('branches')}
              <select
                value={status.branch ?? ''}
                onChange={(event) => {
                  const name = event.target.value
                  void operate(() => props.switchBranch(id, name, false, revision))
                }}
              >
                <option value="" disabled>
                  {t('selectBranch')}
                </option>
                {branches.map(item => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              aria-label={t('branchName')}
              placeholder={t('branchName')}
              value={branch}
              onChange={(event) => {
                setBranch(event.target.value)
              }}
            />
            <button
              disabled={!branch.trim()}
              onClick={() => void operate(() => props.switchBranch(id, branch.trim(), true, revision))}
            >
              {t('createBranch')}
            </button>
          </div>
          <div className="panes">
            <div className="panel">
              <h3>{t('files')}</h3>
              <label>
                <input
                  type="checkbox"
                  checked={changedPaths.length > 0 && selected.length === changedPaths.length}
                  onChange={(event) => {
                    setSelected(event.target.checked ? changedPaths : [])
                  }}
                />
                {t('selectAll')}
              </label>
              <div className="scroll">
                {status.changes.length === 0 ? (
                  <p>{t('clean')}</p>
                ) : (
                  status.changes.map(change => (
                    <div className={`file${path === change.path ? ' selected' : ''}`} key={change.path}>
                      <input
                        type="checkbox"
                        aria-label={`${t('selectFile')} ${change.path}`}
                        checked={selected.includes(change.path)}
                        onChange={(event) => {
                          setSelected(old =>
                            event.target.checked ? [...old, change.path] : old.filter(item => item !== change.path),
                          )
                        }}
                      />
                      <code className={change.conflict ? 'error' : ''}>
                        {change.index}
                        {change.worktree}
                      </code>
                      <button
                        onClick={() => {
                          setPath(change.path)
                        }}
                      >
                        {change.path}
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="row">
                <button disabled={selected.length === 0} onClick={() => void operate(() => props.stage(id, selected, revision))}>
                  {t('stage')}
                </button>
                <button
                  disabled={selected.length === 0}
                  onClick={() => void operate(() => props.unstage(id, selected, revision))}
                >
                  {t('unstage')}
                </button>
              </div>
              <textarea
                aria-label={t('message')}
                placeholder={t('message')}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value)
                }}
              />
              <button
                disabled={
                  !message.trim() ||
                  !status.changes.some(change => change.index !== ' ' && change.index !== '?') ||
                  status.changes.some(change => change.conflict)
                }
                onClick={() => void operate(() => props.commit(id, message, revision), true)}
              >
                {t('commit')}
              </button>
            </div>
            <div className="panel">
              <h3>{t('diff')}</h3>
              <div className="row">
                <button
                  aria-pressed={!staged}
                  onClick={() => {
                    setStaged(false)
                  }}
                >
                  {t('unstaged')}
                </button>
                <button
                  aria-pressed={staged}
                  onClick={() => {
                    setStaged(true)
                  }}
                >
                  {t('staged')}
                </button>
              </div>
              {diff?.truncated && <div className="error">{t('truncated')}</div>}
              <pre className="scroll">{path ? (diff?.untracked ? t('untracked') : (diff?.text ?? '')) : t('noDiff')}</pre>
            </div>
          </div>
          <div className="panel">
            <h3>{t('history')}</h3>
            <div className="scroll">
              {commits.length === 0
                ? t('none')
                : commits.map(commit => (
                  <div className="commit" key={commit.hash}>
                    <code>{commit.hash.slice(0, 8)}</code> {commit.subject}
                    <div>
                      {commit.author} · {new Date(commit.timestamp * 1000).toLocaleString()}
                    </div>
                  </div>
                ))}
            </div>
          </div>
          <div className="panel">
            <div className="row">
              <h3>{t('account')}</h3>
              <button onClick={() => void loadGithub()}>{t('loadPulls')}</button>
            </div>
            {account && <p>{!account.available ? t('missingGh') : (account.login ?? t('signedOut'))}</p>}
            <button
              disabled={account?.available === false || loginController.current !== undefined}
              onClick={() => void signIn()}
            >
              {t('signIn')}
            </button>
            {pulls && (
              <div>
                {pulls.length === 0
                  ? t('noPulls')
                  : pulls.map(pr => (
                    <p key={pr.number}>
                      <a href={pr.url} target="_blank" rel="noreferrer">
                        #{pr.number} {pr.title}
                      </a>{' '}
                      <button onClick={() => void operate(() => props.checkoutPr(id, pr.number, revision))}>
                        {t('checkoutPr')}
                      </button>{' '}
                      <button
                        disabled={pr.isDraft}
                        onClick={() => {
                          setMergeTarget(pr)
                        }}
                      >
                        {t('mergePr')}
                      </button>
                    </p>
                  ))}
              </div>
            )}
          </div>
          {account?.authenticated && (
            <div className="panel">
              <h3>{t('createPr')}</h3>
              <input
                aria-label={t('prTitle')}
                placeholder={t('prTitle')}
                value={prTitle}
                onChange={(event) => {
                  setPrTitle(event.target.value)
                }}
              />
              <input
                aria-label={t('prBase')}
                placeholder={t('prBase')}
                value={prBase}
                onChange={(event) => {
                  setPrBase(event.target.value)
                }}
              />
              <textarea
                aria-label={t('prBody')}
                placeholder={t('prBody')}
                value={prBody}
                onChange={(event) => {
                  setPrBody(event.target.value)
                }}
              />
              <p>{settings.value?.draftPullRequests ? t('draft') : t('createPr')}</p>
              <button
                disabled={!prTitle.trim() || !prBase.trim() || !status.upstream}
                onClick={() => void operate(() => props.createPr(id, prTitle, prBody, prBase, revision))}
              >
                {t('createPr')}
              </button>
            </div>
          )}
        </fieldset>
      )}
      <Modal
        open={loginState !== null}
        onClose={closeLogin}
        title={t('signIn')}
        closeLabel={t('close')}
        footer={<button onClick={closeLogin}>{t('close')}</button>}
      >
        {loginState?.status === 'starting' && <StateDot state="ongoing" size={24} />}
        {loginState?.status === 'waiting' && (
          <>
            <p>{t('loginInstructions')}</p>
            <code>{loginState.code}</code>
            <p>
              <a href={loginState.url} target="_blank" rel="noreferrer">
                {t('openGithub')}
              </a>
            </p>
          </>
        )}
        {loginState?.status === 'complete' && <p>{t('signedIn')}</p>}
        {loginState?.status === 'failed' && (
          <p className="error">{t(loginState.reason === 'timeout' ? 'loginTimeout' : 'failed')}</p>
        )}
      </Modal>
      <Modal
        open={mergeTarget !== null}
        onClose={() => {
          if (!busy) setMergeTarget(null)
        }}
        title={t('mergePr')}
        closeLabel={t('close')}
        footer={
          <div className="row">
            <button
              disabled={busy}
              onClick={() => {
                setMergeTarget(null)
              }}
            >
              {t('cancel')}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                if (!id || !mergeTarget) return
                const target = mergeTarget
                setBusy(true)
                props
                  .mergePr(id, target.number, target.headRefOid)
                  .then(
                    () => {
                      props.notify(t('done'), true)
                      if (mounted.current) {
                        setMergeTarget(null)
                        setPulls(rows => rows?.filter(row => row.number !== target.number))
                      }
                    },
                    (failure: unknown) => {
                      props.notify(String(failure), false)
                    },
                  )
                  .finally(() => {
                    if (mounted.current) setBusy(false)
                  })
              }}
            >
              {t('mergePr')}
            </button>
          </div>
        }
      >
        <p>{t('confirmMerge')}</p>
        <p>
          #{mergeTarget?.number} {mergeTarget?.title}
        </p>
        <p>
          {mergeTarget?.headRefName} → {mergeTarget?.baseRefName}
        </p>
        <code>{mergeTarget?.headRefOid}</code>
        <p>{settings.value?.mergeMethod === 'merge' ? t('merge') : t('squash')}</p>
      </Modal>
      <div className="panel">
        <h3>{t('preferences')}</h3>
        <fieldset disabled={!settings.writable || busy}>
          <div className="row">
            <label>
              {t('branchPrefix')}
              <input
                value={prefix}
                onChange={(event) => {
                  setPrefix(event.target.value)
                }}
              />
            </label>
            <button onClick={() => void save('branchPrefix', prefix)}>{t('save')}</button>
          </div>
          <label>
            <input
              type="checkbox"
              checked={settings.value?.draftPullRequests ?? true}
              onChange={event => void save('draftPullRequests', event.target.checked)}
            />
            {t('draft')}
          </label>
          <label>
            {t('mergeMethod')}
            <select
              value={settings.value?.mergeMethod ?? 'squash'}
              onChange={event => void save('mergeMethod', event.target.value)}
            >
              <option value="squash">{t('squash')}</option>
              <option value="merge">{t('merge')}</option>
            </select>
          </label>
        </fieldset>
      </div>
    </section>
  )
}
