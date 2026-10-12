/** Session-addressed, cold-readable skill catalog Remote. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import { SessionQueryError } from '@deepseek-ai/dsh-session-query'
import { isUserInvocable } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-working-directory'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SkillManagement } from './skill-management.ts'
import type { ManagedSkillCandidate, SkillManagementSnapshot, SkillInstallRequest } from './types.ts'
import type { SkillListRequest, SkillListValue } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the Session-addressed `skills` Remote namespace. */
    sessionSkillCatalog: SessionSkillCatalog
  }
}

/** Host service backing `ctx.remote.skills` without activating a cold Agent. */
export class SessionSkillCatalog extends TypertRemoteService {
  private readonly management: SkillManagement
  static inject = ['agents', 'sessionQuery', 'typert', 'workingDirectory']

  /** @param ctx - Host context carrying Session reads and optional skill/preset services. */
  constructor(ctx: Context) {
    super(ctx, 'sessionSkillCatalog', { namespace: 'skills' })
    ctx.on('skills/change', () => { ctx.emit('api-skills/changed') })
    this.management = new SkillManagement(() => { ctx.get('skills')?.refresh() })
  }

  /**
   * List the user-invocable skills visible to one Session composition.
   * @param request - Session identity whose cwd and preset select the catalog view.
   * @param signal - caller lifetime carried by the Remote transport; admitted catalog reads retain their existing completion semantics.
   * @returns user-invocable skill metadata without loading skill bodies.
   * @throws RemoteError when the Session cannot be inspected or no registry can serve it.
   */
  @Remote
  async list(request: SkillListRequest, signal: AbortSignal): Promise<SkillListValue> {
    const { sessionId } = request
    let cwd: string
    let agentPreset: string | undefined
    try {
      using observation = await this.ctx.sessionQuery.observeSession(sessionId)
      if (observation.projections === undefined) {
        throw new Error('skill catalog requires a projected Session observation')
      }
      cwd = observation.projections.values.workingDirectory
        ?? observation.header.cwd
        ?? this.ctx.workingDirectory.defaultDirectory
      agentPreset = observation.projections.values.agentPreset ?? undefined
      const live = this.ctx.agents.get(sessionId)
      if (live !== undefined) cwd = await this.ctx.workingDirectory.ensure(live, signal)
    } catch (error: unknown) {
      if (error instanceof SessionQueryError
        && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
        throw new RemoteError('session/not-found', `session "${sessionId}" not found`, { sessionId })
      }
      throw new RemoteError(
        'gateway/internal',
        `session "${sessionId}" could not be inspected: ${String(error)}`,
        {},
      )
    }

    const live = this.ctx.agents.get(sessionId)
    const presets = this.ctx.get('agentPresets')
    const scoped = live === undefined ? undefined : presets?.serviceFor(live, 'skills')
    const skillRegistry = scoped ?? this.ctx.get('skills')
    if (skillRegistry === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'skill registry is absent: neither this session\'s agent preset nor the host composition mounts @deepseek-ai/dsh-skill',
        {},
      )
    }

    await using lease = live === undefined ? await this.scopeFor(agentPreset) : undefined
    const scope = live ?? lease?.key
    try {
      const skills = (await skillRegistry.list({ cwd, scope })).filter(isUserInvocable)
      return {
        skills: skills.map(skill => ({
          name: skill.name,
          ...skill.path === undefined ? {} : { path: skill.path },
          description: skill.description,
          ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
          modelInvocable: skill.invocation.modelInvocable,
        })),
      }
    } catch (error: unknown) {
      throw new RemoteError('gateway/internal', `skill listing failed: ${String(error)}`, {})
    }
  }

  /**
   * List managed installations and available local imports.
   * @returns Current management state.
   */
  @Remote
  async installed(): Promise<SkillManagementSnapshot> { return this.management.snapshot() }

  /**
   * Search the public skills.sh catalog.
   * @param query - Public market search text.
   * @param signal - Caller cancellation.
   * @returns Matching public skill metadata.
   */
  @Remote
  async discover(query: string, signal: AbortSignal): Promise<ManagedSkillCandidate[]> { return this.management.discover(query, signal) }

  /**
   * Persist explicit repository subscriptions.
   * @param repositories - Explicit GitHub repository subscriptions.
   */
  @Remote
  async setRepositories(repositories: string[]): Promise<void> { await this.management.repositories(repositories) }

  /**
   * Discover actual skill directories at a pinned repository revision.
   * @param repository - GitHub owner/repository coordinates.
   * @param signal - Caller cancellation.
   * @returns Installable skill locations.
   */
  @Remote
  async repositorySkills(repository: string, signal: AbortSignal): Promise<ManagedSkillCandidate[]> {
    return this.management.repositorySkills(repository, signal)
  }

  /**
   * Read a pinned repository skill document as inert text.
   * @param request - Pinned repository, revision and skill location.
   * @param signal - Caller cancellation.
   * @returns Skill document text.
   */
  @Remote
  async preview(request: SkillInstallRequest, signal: AbortSignal): Promise<string> { return this.management.preview(request, signal) }

  /**
   * Install a reviewed repository skill without executing its code.
   * @param request - Pinned repository, revision and skill location.
   * @param signal - Caller cancellation.
   */
  @Remote
  async installSkill(request: SkillInstallRequest, signal: AbortSignal): Promise<void> { await this.management.install(request, signal) }

  /**
   * Copy an existing local skill into DSH management, preserving its source.
   * @param id - Managed installation or local import identity.
   */
  @Remote
  async importLocal(id: string): Promise<void> { await this.management.importLocal(id) }

  /**
   * Inspect a bounded ZIP before installation.
   * @param base64 - Bounded base64-encoded ZIP content.
   * @returns Installable archive skill locations.
   */
  @Remote
  async zipSkills(base64: string): Promise<ManagedSkillCandidate[]> { return this.management.zipSkills(base64) }

  /**
   * Read a selected archive skill document as inert text.
   * @param base64 - Bounded base64-encoded ZIP content.
   * @param path - Selected skill directory within the archive.
   * @returns Skill document text.
   */
  @Remote
  async previewZip(base64: string, path: string): Promise<string> { return this.management.previewZip(base64, path) }

  /**
   * Install a reviewed skill from a bounded archive.
   * @param base64 - Bounded base64-encoded ZIP content.
   * @param path - Selected skill directory within the archive.
   */
  @Remote
  async installZip(base64: string, path: string): Promise<void> { await this.management.installZip(base64, path) }

  /**
   * Apply a reversible change to a managed installation.
   * @param id - Managed installation or local import identity.
   * @param action - User-requested reversible operation.
   */
  @Remote
  async manage(id: string, action: 'enable' | 'disable' | 'remove' | 'restore'): Promise<void> { await this.management.manage(id, action) }

  /**
   * Check upstream revisions without modifying installations.
   * @param signal - Caller cancellation.
   * @returns Installations with newer upstream revisions.
   */
  @Remote
  async updates(signal: AbortSignal): Promise<Array<{ id: string; revision: string }>> { return this.management.updates(signal) }

  /** Invalidate Host and browser skill catalogs without restarting any Agent. */
  @Remote
  async refresh(): Promise<void> { this.ctx.get('skills')?.refresh() }

  /** Resolve a live or standing preset scope without creating an Agent. */
  private async scopeFor(
    agentPreset: string | undefined,
  ): Promise<({ key: ScopeKey } & AsyncDisposable) | undefined> {
    const presets = this.ctx.get('agentPresets')
    if (presets === undefined) return undefined
    try {
      return await presets.acquireScope(agentPreset)
    } catch {
      // An unknown or unusable recorded preset falls back to the global registry.
      return undefined
    }
  }
}

export default SessionSkillCatalog
