/** Saved OpenSSH targets, explicit connection tests and pinned remote control Sessions. */
import { Service, type Context, type Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { brandString } from '@deepseek-ai/dsh-brand'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-api-terminal-controller'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defaultSshConfigFiles, discoverSshConfigHosts, discoveredSshServerId } from './ssh-config.ts'
import { connectionDomainSpec, type SshBinding } from './spec.ts'
import type {
  ConnectionPreferences,
  SshCommandResult,
  SavedSshConnection,
  SshConnectionId,
  SshConnectionList,
  SshProbe,
  SshProfile,
  SshSessionReceipt,
} from './types.ts'
export type * from './types.ts'

/** Saved bookmarks, executable selection and resource limits. */
export interface Config {
  /** Saved OpenSSH aliases, display preferences and explicit command grants. */
  profiles: Volatile<Record<string, SshProfile>>
  /** OpenSSH executable path or PATH name. */
  sshExecutable: string
  /** Optional explicit OpenSSH configuration file; empty uses normal discovery. */
  sshConfigPath: string
  /** Local control-workspace directory; empty resolves under the running Host DSH home. */
  controlRoot: string
  /** Maximum duration of configuration resolution and connection probes. */
  probeTimeoutMs: number
  /** Maximum duration of one local SSH transport command. */
  commandTimeoutMs: number
  /** Maximum retained bytes per stdout or stderr stream. */
  maxStreamBytes: number
  /** Maximum configuration files visited during alias discovery. */
  maxConfigFiles: number
  /** Maximum bytes read from each discovered configuration file. */
  maxConfigBytes: number
  /** Managed local process termination grace period in milliseconds. */
  graceMs: number
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Saved SSH connections and their pinned Session bindings. */ connectionController: ConnectionController
  }
}

/** Convert a directory or command into one literal POSIX shell argument. */
function quote(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`
}
function alias(value: string): string {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(value)) throw new Error('Choose one concrete SSH Host alias')
  return value
}
function directory(value: string): string {
  if (
    value.length > 4096 ||
    /[\0\r\n]/.test(value) ||
    (value && value !== '~' && !value.startsWith('/') && !value.startsWith('~/'))
  )
    throw new Error('Use an absolute POSIX remote directory, or leave it empty for the account home')
  return value
}
function changeDirectory(value: string): string {
  if (!value || value === '~') return ''
  return value.startsWith('~/') ? `cd -- "$HOME"/${quote(value.slice(2))} && ` : `cd -- ${quote(value)} && `
}

/** Connection control; every command uses a resolved OpenSSH target and never falls back locally. */
export class ConnectionController extends TypertRemoteService {
  static inject = [
    'typert',
    'subprocess',
    'storageDomain',
    'systemPrompt',
    'sessionController',
    'terminalController',
    'agents',
    'workspaceRegistry',
    'permissionPresets',
    'sandboxPolicy',
  ]
  static Config = z.object({
    profiles: z
      .dict(
        z.object({
          alias: z.string().required(),
          label: z.string().required(),
          directory: z.string().default(''),
          allowAgentCommands: z.boolean().default(false),
        }),
      )
      .default({})
      .volatile(),
    sshExecutable: z.string().min(1).default('ssh'),
    sshConfigPath: z.string().default(''),
    controlRoot: z.string().default(''),
    probeTimeoutMs: z.number().step(1).min(1000).max(120_000).default(15_000),
    commandTimeoutMs: z.number().step(1).min(1000).max(600_000).default(120_000),
    maxStreamBytes: z
      .number()
      .step(1)
      .min(1024)
      .max(1024 * 1024)
      .default(64 * 1024),
    maxConfigFiles: z.number().step(1).min(1).max(1000).default(64),
    maxConfigBytes: z
      .number()
      .step(1)
      .min(1024)
      .max(1024 * 1024)
      .default(256 * 1024),
    graceMs: z.number().step(1).min(1).max(30_000).default(1000),
  })
  private readonly controlRoot: string
  private readonly lifetime = new AbortController()
  private readonly children = new Set<SubprocessHandle>()
  private readonly starts = new Map<string, { key: string; promise: Promise<SshSessionReceipt> }>()
  private bindings: KvTable<SessionId, SshBinding> | undefined
  constructor(
    ctx: Context,
    private readonly config: Config,
  ) {
    super(ctx, 'connectionController', { namespace: 'connections' })
    this.controlRoot =
      config.controlRoot || join(resolve(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')), 'ssh-workspaces')
    for (const [id, profile] of Object.entries(config.profiles.get())) this.validateProfile(id, profile)
    ctx.inject(['settings'], (child) => {
      child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
    })
  }
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(connectionDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'connections: bindings')
    this.bindings = domain.table('sessions')
    this.ctx.effect(
      () =>
        this.ctx.systemPrompt.context({
          name: 'ssh-connection',
          order: 45,
          text: ({ agent }) => {
            const binding = agent ? this.bindings?.get(agent.id) : undefined
            return binding
              ? `This conversation controls the saved SSH connection ${JSON.stringify(binding.label)}. Remote working directory: ${JSON.stringify(binding.directory || '~')}. Use ssh_exec for remote work. Commands run with the SSH account permissions, in separate non-interactive POSIX shells. The Agent and conversation are hosted locally. A timeout or disconnect does not prove a remote command stopped; inspect its outcome before retrying.`
              : ''
          },
        }),
      'connections: logged target context',
    )
    this.ctx.effect(
      () => async () => {
        this.lifetime.abort()
        for (const child of this.children) child.terminate()
        await Promise.allSettled([...this.starts.values()].map(entry => entry.promise))
        await Promise.allSettled(
          [...this.children].map(async (child) => {
            await child.done.catch(() => {
              /* Shutdown still joins the process after a reported spawn or collection failure. */
            })
            await child.waitForExit()
          }),
        )
      },
      'connections: owned processes',
    )
  }

  /**
   * Discover concrete Host aliases and overlay saved user preferences.
   * @returns connection rows without private keys, passwords or raw SSH configuration.
   */
  @Remote
  async list(): Promise<SshConnectionList> {
    const discovered = await discoverSshConfigHosts(
      this.config.sshConfigPath ? [this.config.sshConfigPath] : defaultSshConfigFiles(),
      { maxFiles: this.config.maxConfigFiles, maxBytes: this.config.maxConfigBytes },
    )
    const rows = new Map<string, SavedSshConnection>()
    for (const host of discovered.hosts) {
      if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(host.sshTarget)) continue
      rows.set(host.id, {
        id: brandString<SshConnectionId>(host.id),
        alias: host.sshTarget,
        label: host.label,
        directory: '',
        allowAgentCommands: false,
        saved: false,
      })
    }
    for (const [id, profile] of Object.entries(this.config.profiles.get())) {
      this.validateProfile(id, profile)
      rows.set(id, { ...profile, id: brandString<SshConnectionId>(id), saved: true })
    }
    return { connections: [...rows.values()], warnings: discovered.errors }
  }

  /**
   * Read bookmark preferences for the settings page.
   * @returns detached aliases, labels and explicit remote-command grants.
   */
  @Remote
  preferences(): ConnectionPreferences {
    return { profiles: structuredClone(this.config.profiles.get()) }
  }

  /**
   * Check authentication using a fixed read-only command and existing known-host trust.
   * @param id - discovered or saved connection identity.
   * @param signal - caller cancellation.
   * @returns authentication outcome and the resolved endpoint, never a private key.
   */
  @Remote
  async test(id: SshConnectionId, signal: AbortSignal): Promise<SshProbe> {
    const profile = await this.profile(id)
    const binding = await this.resolveBinding(profile, signal)
    const result = await this.run(
      [...this.targetArgs(binding), 'echo DSH_CONNECTION_OK'],
      this.controlRoot,
      this.config.probeTimeoutMs,
      signal,
    )
    return {
      connected:
        result.exitCode === 0 &&
        !result.timedOut &&
        result.stdout.split(/\r?\n/).some(line => line.trim() === 'DSH_CONNECTION_OK'),
      host: binding.host,
      user: binding.user,
      port: binding.port,
      message: result.timedOut
        ? 'SSH connection timed out'
        : result.exitCode === 0
          ? ''
          : result.stderr.trim() || 'SSH connection failed',
    }
  }

  /**
   * Create a dedicated local control conversation and optionally open its remote terminal.
   * @param id - connection selected by the user.
   * @param requestId - stable identity for retrying the same connection action.
   * @param terminal - open an interactive SSH terminal after Session creation.
   * @param signal - preparation cancellation.
   * @returns Session and optional terminal identities.
   */
  @Remote
  start(id: SshConnectionId, requestId: string, terminal: boolean, signal: AbortSignal): Promise<SshSessionReceipt> {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(requestId)) throw new Error('Invalid connection request identity')
    const key = JSON.stringify([id, terminal])
    const previous = this.starts.get(requestId)
    if (previous) {
      if (previous.key !== key) throw new Error('Connection retry changed its target')
      return previous.promise
    }
    const promise = this.prepare(id, requestId, terminal, AbortSignal.any([signal, this.lifetime.signal]))
    this.starts.set(requestId, { key, promise })
    void promise
      .finally(() => this.starts.delete(requestId))
      .catch(() => {
        /* The initiating request receives failure. */
      })
    return promise
  }

  /**
   * Run a command only for the initiating SSH Session and its explicitly enabled target.
   * @param agent - exact live Agent supplied by tool execution.
   * @param command - POSIX command deliberately requested for this server.
   * @param signal - tool cancellation.
   * @returns bounded output; remote process state is unknown after timeout/disconnect.
   */
  async execute(agent: Agent, command: string, signal: AbortSignal): Promise<SshCommandResult> {
    if (this.ctx.agents.get(agent.id) !== agent) throw new Error('SSH Session is no longer active')
    const binding = this.bindings?.get(agent.id)
    if (!binding) throw new Error('This conversation has no selected SSH target')
    const saved = this.config.profiles.get()[binding.connectionId]
    if (saved) this.validateProfile(binding.connectionId, saved)
    if (!saved?.allowAgentCommands)
      throw new Error('Enable AI remote commands for this connection in Settings before running them')
    if (this.ctx.sandboxPolicy.resolve({ session: agent.session }).mode !== 'danger-full-access')
      throw new Error('Remote execution uses SSH account permissions; this conversation must explicitly allow full access')
    if (!command.trim() || command.length > 32_768 || command.includes('\0')) throw new Error('Enter a bounded remote command')
    return this.run(
      [...this.targetArgs(binding), `${changeDirectory(binding.directory)}sh -c ${quote(command)}`],
      this.controlRoot,
      this.config.commandTimeoutMs,
      signal,
    )
  }

  private async prepare(
    id: SshConnectionId,
    requestId: string,
    terminal: boolean,
    signal: AbortSignal,
  ): Promise<SshSessionReceipt> {
    const profile = await this.profile(id)
    const sessionId = brandString<SessionId>(`ssh-${requestId}`)
    const bindings = this.bindings
    if (!bindings) throw new Error('Connection storage is not ready')
    let binding = bindings.get(sessionId)
    if (binding && binding.connectionId !== id) throw new Error('This Session is bound to another server')
    if (!binding) {
      binding = await this.resolveBinding(profile, signal)
      await bindings.put(sessionId, binding)
    }
    signal.throwIfAborted()
    const cwd = join(this.controlRoot, id)
    await mkdir(cwd, { recursive: true })
    const workspace = await this.ctx.workspaceRegistry.create(cwd, `SSH · ${binding.label}`)
    await this.ctx.sessionController.create({ workspaceId: workspace.id, sessionId, agentPreset: 'ssh-session' })
    const agent = this.ctx.agents.get(sessionId)
    if (!agent) throw new Error('SSH conversation did not activate')
    this.ctx.permissionPresets.set(agent.session, profile.allowAgentCommands ? 'danger-full-access' : 'read-only')
    await this.ctx.sessionController.rename({ sessionId, title: `SSH · ${binding.label}` })
    if (!terminal) return { sessionId }
    const executable = await this.ctx.subprocess.resolveExecutable(this.config.sshExecutable, undefined, signal)
    const terminalId = brandString<WebTerminalId>(`ssh-terminal-${requestId}`)
    await this.ctx.terminalController.createWithShell(
      agent,
      { id: terminalId, cols: 100, rows: 28 },
      {
        path: executable,
        name: `SSH · ${binding.label}`,
        args: [
          ...this.targetArgs(binding, true),
          ...(binding.directory ? [`${changeDirectory(binding.directory)}exec "\${SHELL:-/bin/sh}" -l`] : []),
        ],
      },
      signal,
    )
    return { sessionId, terminalId }
  }

  private async profile(id: SshConnectionId): Promise<SavedSshConnection> {
    const profile = (await this.list()).connections.find(connection => connection.id === id)
    if (!profile) throw new Error('The SSH connection is no longer available')
    return profile
  }
  private validateProfile(id: string, profile: SshProfile): void {
    alias(profile.alias)
    directory(profile.directory)
    if (id !== discoveredSshServerId(profile.alias) || !profile.label.trim() || profile.label.length > 200)
      throw new Error('Invalid saved SSH connection')
  }
  private configArgs(): string[] {
    return this.config.sshConfigPath ? ['-F', this.config.sshConfigPath] : []
  }
  private targetArgs(binding: SshBinding, interactive = false): string[] {
    return [
      ...this.configArgs(),
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ForwardAgent=no',
      '-o',
      'PermitLocalCommand=no',
      '-o',
      'ExitOnForwardFailure=yes',
      ...(interactive ? ['-tt'] : ['-T', '-o', 'BatchMode=yes', '-o', 'ClearAllForwardings=yes']),
      '-o',
      `HostName=${binding.host}`,
      '-l',
      binding.user,
      '-p',
      String(binding.port),
      binding.alias,
    ]
  }
  private async resolveBinding(profile: SavedSshConnection, signal: AbortSignal): Promise<SshBinding> {
    alias(profile.alias)
    directory(profile.directory)
    const result = await this.run(
      [...this.configArgs(), '-G', profile.alias],
      this.controlRoot,
      this.config.probeTimeoutMs,
      signal,
    )
    if (result.exitCode !== 0 || result.timedOut || result.truncated) throw new Error('Could not resolve the SSH configuration')
    const values = new Map<string, string>(
      result.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const at = line.indexOf(' ')
          return [line.slice(0, at), line.slice(at + 1)] as const
        }),
    )
    const host = values.get('hostname') ?? ''
    const user = values.get('user') ?? ''
    const port = Number(values.get('port'))
    if (!host || !user || /[\0\r\n]/.test(host + user) || !Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('SSH configuration returned an invalid endpoint')
    return {
      connectionId: profile.id,
      alias: profile.alias,
      label: profile.label,
      directory: profile.directory,
      host,
      user,
      port,
    }
  }
  private async run(args: string[], cwd: string, timeoutMs: number, requestSignal: AbortSignal): Promise<SshCommandResult> {
    requestSignal.throwIfAborted()
    this.lifetime.signal.throwIfAborted()
    await mkdir(cwd, { recursive: true })
    const deadline = new AbortController()
    const timer = setTimeout(() => {
      deadline.abort()
    }, timeoutMs)
    const signal = AbortSignal.any([requestSignal, this.lifetime.signal, deadline.signal])
    let child: SubprocessHandle | undefined
    try {
      const executable = await this.ctx.subprocess.resolveExecutable(this.config.sshExecutable, undefined, signal)
      signal.throwIfAborted()
      child = this.ctx.subprocess.spawn({
        argv: [executable, ...args],
        cwd,
        signal,
        graceMs: this.config.graceMs,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: this.config.maxStreamBytes },
          stderr: { maxBytes: this.config.maxStreamBytes },
        },
      })
      this.children.add(child)
      const result = await child.done
      if (signal.aborted) await child.waitForExit()
      requestSignal.throwIfAborted()
      this.lifetime.signal.throwIfAborted()
      const stdoutReader = child.collected.stdout,
        stderrReader = child.collected.stderr
      if (!stdoutReader || !stderrReader) throw new Error('Command output collection is unavailable')
      const stdout = stdoutReader.readFrom(0),
        stderr = stderrReader.readFrom(0)
      return {
        stdout: stdout.text,
        stderr: stderr.text,
        exitCode: result.exitCode,
        timedOut: deadline.signal.aborted,
        truncated: stdout.lossy || stderr.lossy,
      }
    } finally {
      clearTimeout(timer)
      if (child) this.children.delete(child)
    }
  }
}
export default ConnectionController
