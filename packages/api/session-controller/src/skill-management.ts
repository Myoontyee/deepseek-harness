/** User-owned skill installations, bounded downloads and reversible mutations. */
import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve, relative, sep, posix } from 'node:path'
import { mkdir, readFile, writeFile, readdir, lstat, realpath, rename, rm } from 'node:fs/promises'
import { unzipSync } from 'fflate'
import { parse as parseYaml } from 'yaml'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import type { ManagedSkillCandidate, ManagedSkillRecord, SkillManagementSnapshot, SkillInstallRequest } from './types.ts'

const MAX_BYTES = 20 * 1024 * 1024
const MAX_FILES = 2000
const MAX_SKILL_TEXT = 512 * 1024
interface State { version: 1; repositories: string[]; records: ManagedSkillRecord[] }
type Bundle = Map<string, Uint8Array>

/**
 * Validate GitHub repository coordinates.
 * @param value - Repository coordinates or a GitHub repository URL.
 * @returns Validated owner/repository.
 */
export function skillRepository(value: string): string {
  const input = value.trim().replace(/^https:\/\/github\.com\//u, '').replace(/\.git$/u, '').replace(/\/$/u, '')
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/u.test(input) || input.split('/')[1] === '..') {
    throw new Error('Use a GitHub owner/repository or its repository URL.')
  }
  return input
}
function safeRelative(value: string): string {
  if (!value || value.includes('\\') || value.startsWith('/') || value.split('/').some(part => !part || part === '..' || part === '.' || /[:\x00-\x1f]/u.test(part))) {
    throw new Error('Invalid skill archive path')
  }
  return value
}
function skillMetadata(bytes: Uint8Array): { name: string; description: string } {
  if (bytes.length > MAX_SKILL_TEXT) throw new Error('SKILL.md is too large')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text)
  const data: unknown = match?.[1] === undefined ? undefined : parseYaml(match[1])
  if (typeof data !== 'object' || data === null || !('name' in data) || typeof data.name !== 'string' || !isSkillName(data.name)
    || !('description' in data) || typeof data.description !== 'string' || data.description.length > 16000) {
    throw new Error('SKILL.md needs a valid name and description.')
  }
  return { name: data.name, description: data.description }
}
/**
 * Decode a bounded archive into inert regular file contents.
 * @param data - ZIP archive bytes.
 * @returns Validated relative paths and file contents.
 */
export function skillArchive(data: Uint8Array): Bundle {
  if (data.length > MAX_BYTES) throw new Error('Archive exceeds 20 MiB')
  let total = 0; let count = 0
  const paths = new Set<string>()
  const files = unzipSync(data, { filter(entry) {
    const path = entry.name.endsWith('/') ? entry.name.slice(0, -1) : entry.name
    safeRelative(path)
    const normalized = path.toLowerCase()
    if (paths.has(normalized)) throw new Error('Duplicate archive path')
    paths.add(normalized)
    total += entry.originalSize; count++
    if (total > MAX_BYTES || count > MAX_FILES) throw new Error('Expanded archive exceeds installation limits')
    return !entry.name.endsWith('/') && !entry.name.split('/').some(part => part === '.git' || part === 'node_modules')
  } })
  return new Map(Object.entries(files))
}
function candidates(bundle: Bundle, source: string, repository?: string, revision?: string): ManagedSkillCandidate[] {
  const result: ManagedSkillCandidate[] = []
  for (const [path, data] of bundle) {
    if (posix.basename(path) !== 'SKILL.md') continue
    try {
      result.push({ id: path, path: posix.dirname(path), source, ...skillMetadata(data),
        ...repository === undefined ? {} : { repository }, ...revision === undefined ? {} : { revision } })
    } catch { /* Unrelated or malformed skill documents are not installable candidates. */ }
  }
  return result
}
function selectBundle(bundle: Bundle, path: string): { files: Bundle; name: string; description: string } {
  if (path !== '.') safeRelative(path)
  const prefix = path === '.' ? '' : `${path}/`
  const doc = bundle.get(`${prefix}SKILL.md`)
  if (doc === undefined) throw new Error('The selected skill no longer exists')
  const files: Bundle = new Map()
  for (const [name, bytes] of bundle) {
    if (name.startsWith(prefix)) files.set(safeRelative(name.slice(prefix.length)), bytes)
  }
  return { files, ...skillMetadata(doc) }
}
function hash(bundle: Bundle): string {
  const digest = createHash('sha256')
  for (const [name, data] of [...bundle].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    digest.update(JSON.stringify([name, data.length])).update(data)
  }
  return digest.digest('hex')
}
async function localBundle(directory: string): Promise<Bundle> {
  const base = await realpath(directory)
  const files: Bundle = new Map(); let total = 0
  async function visit(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      if (entry.isSymbolicLink()) throw new Error('Linked files inside a skill must be imported explicitly as regular files')
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) {
        const info = await lstat(path); total += info.size
        if (total > MAX_BYTES || files.size >= MAX_FILES) throw new Error('Local skill exceeds installation limits')
        files.set(relative(base, path).split(sep).join('/'), await readFile(path))
      }
    }
  }
  await visit(base)
  return files
}
async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}
async function boundedFetch(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), redirect: 'error',
    headers: { accept: 'application/json', 'user-agent': 'DeepSeek-Harness-Skill-Manager' } })
  if (!response.ok) throw new Error(`Skill source returned HTTP ${response.status}`)
  if (response.body === null) throw new Error('Empty skill response')
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > MAX_BYTES) throw new Error('Skill source exceeds 20 MiB')
      parts.push(part.value)
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  const data = new Uint8Array(size); let offset = 0
  for (const part of parts) { data.set(part, offset); offset += part.length }
  return data
}
async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await boundedFetch(url, signal)))
}
/** Management owner; all mutations are serialized and installs never execute downloaded code. */
export class SkillManagement {
  private readonly root: string
  private readonly data: string
  private tail: Promise<unknown> = Promise.resolve()
  private readonly downloads = new Map<string, Bundle>()
  constructor(private readonly changed: () => void, dshHome = resolveDshHome(), private readonly userHome = homedir()) {
    this.root = join(dshHome, 'skills'); this.data = join(dshHome, 'skill-manager')
  }
  private async state(): Promise<State> {
    try {
      const state = JSON.parse(await readFile(join(this.data, 'state.json'), 'utf8')) as State
      if (state.version !== 1 || !Array.isArray(state.records) || !Array.isArray(state.repositories)) throw new Error('Invalid skill manager state')
      for (const record of state.records) {
        if (!isSkillName(record.name) || !/^[\w-]+$/u.test(record.id) || (record.backup !== undefined && !/^[\w-]+$/u.test(record.backup))) throw new Error('Invalid stored skill path')
      }
      return state
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { version: 1, repositories: [], records: [] }
      throw error
    }
  }
  private async save(state: State): Promise<void> {
    await mkdir(this.data, { recursive: true })
    const temp = join(this.data, `${randomUUID()}.tmp`)
    await writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 })
    await rename(temp, join(this.data, 'state.json'))
  }
  private run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action)
    this.tail = result.catch(() => {})
    return result
  }
  private sources(): Record<string, string> {
    return { dsh: this.root, agents: join(this.userHome, '.agents', 'skills'), codex: join(this.userHome, '.codex', 'skills'),
      claude: join(this.userHome, '.claude', 'skills'), 'cc-switch': join(this.userHome, '.cc-switch', 'skills') }
  }
  /**
   * List managed installations and available local imports.
   * @returns Current management state.
   */
  async snapshot(): Promise<SkillManagementSnapshot> {
    await this.tail
    const state = await this.state(); const local: ManagedSkillCandidate[] = []
    for (const [source, root] of Object.entries(this.sources())) {
      if (!await exists(root)) continue
      for (const entry of (await readdir(root, { withFileTypes: true })).slice(0, 1000)) {
        if (entry.name.startsWith('.') || (!entry.isDirectory() && !entry.isSymbolicLink())) continue
        if (source === 'dsh' && state.records.some(record => record.name === entry.name && !record.removed)) continue
        try {
          const bytes = await readFile(join(root, entry.name, 'SKILL.md'))
          local.push({ id: `${source}:${entry.name}`, path: entry.name, source, ...skillMetadata(bytes) })
        } catch { /* A local folder without a valid SKILL.md is not an import candidate. */ }
      }
    }
    return { installed: state.records, local, repositories: state.repositories }
  }
  /**
   * Persist explicit repository subscriptions.
   * @param values - Explicit GitHub repository subscriptions.
   */
  async repositories(values: string[]): Promise<void> {
    if (values.length > 30) throw new Error('At most 30 repositories can be configured')
    const repositories = [...new Set(values.map(skillRepository))]
    await this.run(async () => { const state = await this.state(); state.repositories = repositories; await this.save(state) })
  }
  /**
   * Search the public skills.sh catalog.
   * @param query - Public market search text.
   * @param signal - Caller cancellation.
   * @returns Matching public skill metadata.
   */
  async discover(query: string, signal: AbortSignal): Promise<ManagedSkillCandidate[]> {
    if (query.length > 200) throw new Error('Search query is too long')
    const result = await fetchJson(`https://skills.sh/api/search?q=${encodeURIComponent(query)}&limit=30&offset=0`, signal)
    if (typeof result !== 'object' || result === null || !('skills' in result) || !Array.isArray(result.skills)) throw new Error('Invalid skill market response')
    return result.skills.flatMap((item: unknown) => {
      if (typeof item !== 'object' || item === null || !('source' in item) || typeof item.source !== 'string'
        || !('skillId' in item) || typeof item.skillId !== 'string' || !('name' in item) || typeof item.name !== 'string') return []
      try {
        const repository = skillRepository(item.source)
        return [{ id: `${repository}:${item.skillId}`, name: item.name, description: repository, path: item.skillId,
          source: 'skills.sh', repository, installs: 'installs' in item && typeof item.installs === 'number' ? item.installs : 0 }]
      } catch { return [] }
    })
  }
  private async revision(repository: string, signal: AbortSignal): Promise<string> {
    const result = await fetchJson(`https://api.github.com/repos/${skillRepository(repository)}/commits/HEAD`, signal)
    if (typeof result !== 'object' || result === null || !('sha' in result) || typeof result.sha !== 'string' || !/^[a-f0-9]{40}$/u.test(result.sha)) throw new Error('Invalid GitHub revision')
    return result.sha
  }
  private async download(repository: string, revision: string, signal: AbortSignal): Promise<Bundle> {
    const repo = skillRepository(repository)
    if (!/^[a-f0-9]{40}$/u.test(revision)) throw new Error('Choose a pinned repository revision before installing')
    const key = `${repo}@${revision}`
    const cached = this.downloads.get(key)
    if (cached !== undefined) return cached
    const bundle = skillArchive(await boundedFetch(`https://codeload.github.com/${repo}/zip/${revision}`, signal))
    if (this.downloads.size >= 2) this.downloads.clear()
    this.downloads.set(key, bundle)
    return bundle
  }
  /**
   * Discover actual skill directories at a pinned repository revision.
   * @param repository - GitHub owner/repository coordinates.
   * @param signal - Caller cancellation.
   * @returns Installable skill locations.
   */
  async repositorySkills(repository: string, signal: AbortSignal): Promise<ManagedSkillCandidate[]> {
    const repo = skillRepository(repository); const revision = await this.revision(repo, signal)
    return candidates(await this.download(repo, revision, signal), 'github', repo, revision)
  }
  /**
   * Inspect a bounded ZIP before installation.
   * @param base64 - Bounded base64-encoded ZIP content.
   * @returns Installable archive skill locations.
   */
  zipSkills(base64: string): ManagedSkillCandidate[] { return candidates(skillArchive(this.decodeZip(base64)), 'zip') }
  /**
   * Read a selected archive skill document as inert text.
   * @param base64 - Bounded base64-encoded ZIP content.
   * @param path - Selected skill directory within the archive.
   * @returns Skill document text.
   */
  previewZip(base64: string, path: string): string {
    return new TextDecoder().decode(selectBundle(skillArchive(this.decodeZip(base64)), path).files.get('SKILL.md'))
  }
  private decodeZip(base64: string): Buffer {
    if (base64.length > MAX_BYTES * 1.4 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(base64)) throw new Error('Invalid ZIP upload')
    return Buffer.from(base64, 'base64')
  }
  /**
   * Read a pinned repository skill document as inert text.
   * @param request - Pinned repository, revision and skill location.
   * @param signal - Caller cancellation.
   * @returns Skill document text.
   */
  async preview(request: SkillInstallRequest, signal: AbortSignal): Promise<string> {
    const selected = selectBundle(await this.download(request.repository, request.revision, signal), request.path)
    return new TextDecoder().decode(selected.files.get('SKILL.md'))
  }
  private async installBundle(bundle: Bundle, path: string, source: string, origin: Partial<ManagedSkillRecord> = {}): Promise<void> {
    const selected = selectBundle(bundle, path)
    await this.run(async () => {
      const state = await this.state()
      const previous = state.records.find(record => record.name === selected.name && !record.removed)
      if (previous !== undefined && previous.source.toLowerCase() !== source.toLowerCase()) {
        throw new Error('A skill with this name is installed from another source. Remove it before changing sources.')
      }
      const target = previous?.enabled === false ? join(this.data, 'disabled', previous.id) : join(this.root, selected.name)
      if (await exists(target)) {
        if (previous === undefined) throw new Error('An unmanaged skill with this name already exists; import it first or choose another skill.')
        if (hash(await localBundle(target)) !== previous.hash) throw new Error('Local skill files were edited. Export a copy before updating.')
      }
      const staging = join(this.data, 'staging', randomUUID())
      await mkdir(staging, { recursive: true })
      let backup: string | undefined
      let installed = false
      try {
        for (const [name, bytes] of selected.files) {
          const output = resolve(staging, safeRelative(name))
          if (!output.startsWith(staging + sep)) throw new Error('Unsafe install path')
          await mkdir(join(output, '..'), { recursive: true }); await writeFile(output, bytes)
        }
        await mkdir(join(this.data, 'backups'), { recursive: true }); await mkdir(this.root, { recursive: true })
        if (await exists(target)) {
          backup = randomUUID()
          await writeFile(join(this.data, 'backups', backup + '.json'), JSON.stringify(previous))
          await rename(target, join(this.data, 'backups', backup))
        }
        try {
          await mkdir(join(target, '..'), { recursive: true })
          await rename(staging, target)
          installed = true
          const record: ManagedSkillRecord = { id: previous?.id ?? randomUUID(), name: selected.name, description: selected.description,
            source, hash: hash(selected.files),
            enabled: previous?.enabled ?? true, removed: false, installedAt: new Date().toISOString(), ...origin,
            ...backup === undefined ? {} : { backup } }
          // File content is owned by disk, not the metadata index.
          state.records = [...state.records.filter(item => item.name !== selected.name), record]
          await this.save(state)
        } catch (error) {
          if (installed) await rm(target, { recursive: true, force: true })
          if (backup !== undefined) await rename(join(this.data, 'backups', backup), target)
          throw error
        }
        this.changed()
      } finally { await rm(staging, { recursive: true, force: true }) }
    })
  }
  /**
   * Install a reviewed repository skill without executing its code.
   * @param request - Pinned repository, revision and skill location.
   * @param signal - Caller cancellation.
   */
  async install(request: SkillInstallRequest, signal: AbortSignal): Promise<void> {
    const bundle = await this.download(request.repository, request.revision, signal); signal.throwIfAborted()
    await this.installBundle(bundle, request.path, request.repository, { repository: skillRepository(request.repository),
      revision: request.revision, skillPath: request.path })
  }
  /**
   * Copy an existing local skill into DSH management, preserving its source.
   * @param id - Managed installation or local import identity.
   */
  async importLocal(id: string): Promise<void> {
    const [source, name, extra] = id.split(':')
    if (source === undefined || name === undefined || extra !== undefined || !/^[A-Za-z0-9_.-]+$/u.test(name) || name.startsWith('.')) throw new Error('Invalid import identity')
    const root = this.sources()[source]; if (root === undefined) throw new Error('Unknown skill source')
    if (source === 'dsh') {
      await this.run(async () => {
        const files = await localBundle(join(root, name)); const selected = selectBundle(files, '.')
        if (selected.name !== name) throw new Error('Skill directory and declared name must match before importing')
        const state = await this.state()
        if (state.records.some(record => record.name === name && !record.removed)) throw new Error('Already managed')
        state.records.push({ id: randomUUID(), name, description: selected.description, source, hash: hash(files),
          enabled: true, removed: false, installedAt: new Date().toISOString() })
        await this.save(state); this.changed()
      })
    } else await this.installBundle(await localBundle(join(root, name)), '.', source)
  }
  /**
   * Install a reviewed skill from a bounded archive.
   * @param base64 - Bounded base64-encoded ZIP content.
   * @param path - Selected skill directory within the archive.
   */
  async installZip(base64: string, path: string): Promise<void> { await this.installBundle(skillArchive(this.decodeZip(base64)), path, 'zip') }
  /**
   * Apply a reversible change to a managed installation.
   * @param id - Managed installation or local import identity.
   * @param action - User-requested reversible operation.
   */
  async manage(id: string, action: 'enable' | 'disable' | 'remove' | 'restore'): Promise<void> {
    if (!['enable', 'disable', 'remove', 'restore'].includes(action)) throw new Error('Unknown skill operation')
    await this.run(async () => {
      const state = await this.state(); const record = state.records.find(item => item.id === id)
      if (record === undefined) throw new Error('Skill is not managed here')
      const active = join(this.root, record.name); const disabled = join(this.data, 'disabled', record.id)
      let from: string; let to: string
      let displaced: string | undefined
      if (action === 'restore') {
        if (record.backup === undefined) throw new Error('No backup is available')
        from = join(this.data, 'backups', record.backup)
        to = record.enabled || record.removed ? active : disabled
        const restored = selectBundle(await localBundle(from), '.')
        if (restored.name !== record.name) throw new Error('Backup identity does not match the installation')
        let metadata: Partial<ManagedSkillRecord> = {}
        if (await exists(from + '.json')) metadata = JSON.parse(await readFile(from + '.json', 'utf8')) as Partial<ManagedSkillRecord>
        if (await exists(to)) {
          displaced = randomUUID()
          await writeFile(join(this.data, 'backups', displaced + '.json'), JSON.stringify(record))
          await rename(to, join(this.data, 'backups', displaced))
        }
        record.description = restored.description
        if (metadata.revision === undefined) delete record.revision; else record.revision = metadata.revision
        if (metadata.skillPath === undefined) delete record.skillPath; else record.skillPath = metadata.skillPath
        record.enabled = to === active; record.removed = false
        if (displaced === undefined) delete record.backup; else record.backup = displaced
      } else {
        if (record.removed) throw new Error('Skill was removed; restore it first')
        from = record.enabled ? active : disabled
        if (action === 'remove') {
          const backup = randomUUID()
          await mkdir(join(this.data, 'backups'), { recursive: true })
          await writeFile(join(this.data, 'backups', backup + '.json'), JSON.stringify(record))
          record.backup = backup; to = join(this.data, 'backups', backup); record.removed = true; record.enabled = false
        } else {
          if (record.enabled === (action === 'enable')) return
          to = action === 'enable' ? active : disabled; record.enabled = action === 'enable'
        }
      }
      if (await exists(to)) throw new Error('Destination already contains a skill; nothing was overwritten')
      await mkdir(join(to, '..'), { recursive: true })
      try { await rename(from, to) }
      catch (error) { if (displaced !== undefined) await rename(join(this.data, 'backups', displaced), to); throw error }
      try { record.hash = hash(await localBundle(to)); await this.save(state) }
      catch (error) {
        await rename(to, from)
        if (displaced !== undefined) await rename(join(this.data, 'backups', displaced), to)
        throw error
      }
      this.changed()
    })
  }
  /**
   * Check upstream revisions without modifying installations.
   * @param signal - Caller cancellation.
   * @returns Installations with newer upstream revisions.
   */
  async updates(signal: AbortSignal): Promise<Array<{ id: string; revision: string }>> {
    const state = await this.state(); const updates: Array<{ id: string; revision: string }> = []
    const revisions = new Map<string, string>()
    for (const record of state.records.filter(item => item.repository !== undefined && !item.removed)) {
      signal.throwIfAborted()
      if (record.repository === undefined) continue
      const revision = revisions.get(record.repository) ?? await this.revision(record.repository, signal)
      revisions.set(record.repository, revision)
      if (revision !== record.revision) updates.push({ id: record.id, revision })
    }
    return updates
  }
}
