/** Read-only profile inventory. This module never writes to a profile or DSH home. */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import type {
  ConfigEntry, FileEntry, FileFingerprint, Inventory, PackageEntry, PackageSource, PresetEntry,
  SkillEntry, UnsupportedEntry,
} from './types.ts'

/** Inputs for one read-only inventory run. */
export interface InventoryOptions {
  /** DSH home, normally ~/.dsh. */
  dshHome: string
  /** Profile directory name, normally desktop. */
  profileName: string
  /** Product base version the receiving Host must share. */
  hostBaseVersion: string
  /** Fixed clock for deterministic tests. */
  now?: Date
}

interface ProfilePackage {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

const EXCLUDED = [
  'node_modules (installed dependencies are rebuilt from the manifest)',
  '.credentials.yaml (credential values are never exported)',
  'mobile-control.dat / paired-computers.dat (OS-encrypted device grants)',
  '*.bak-* profile backups',
]

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function fingerprint(path: string, displayPath: string): FileFingerprint {
  const bytes = readFileSync(path)
  return { path: displayPath, sha256: sha256(bytes), bytes: bytes.length }
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function specPath(profilePath: string, value: string): string {
  return resolve(profilePath, value)
}

/** Hash a regular file or directory using relative names and per-file SHA256 values. */
function hashTree(root: string): { sha256: string; files: number; symlinks: number } {
  const rows: string[] = []
  let symlinks = 0
  const visit = (path: string): void => {
    const info = lstatSync(path)
    if (info.isSymbolicLink()) { symlinks += 1; return }
    if (info.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(join(path, name))
      return
    }
    if (info.isFile()) rows.push(`${relative(root, path).replaceAll('\\', '/')}\0${sha256(readFileSync(path))}`)
  }
  if (lstatSync(root).isDirectory()) {
    for (const name of readdirSync(root).sort()) visit(join(root, name))
  } else {
    visit(root)
  }
  return { sha256: sha256(Buffer.from(rows.join('\n'))), files: rows.length, symlinks }
}

function installedVersion(profilePath: string, name: string): string | undefined {
  try {
    const requireFromProfile = createRequire(join(profilePath, 'package.json'))
    const manifest = requireFromProfile(`${name}/package.json`) as { version?: unknown }
    return typeof manifest.version === 'string' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

function sourceOf(spec: string): PackageSource {
  if (spec.startsWith('file:')) return 'tarball'
  if (spec.startsWith('link:')) return 'link'
  if (spec.startsWith('workspace:')) return 'workspace'
  if (/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(spec) || spec.startsWith('^') || spec.startsWith('~')) return 'registry'
  return 'unknown'
}

function classify(name: string, spec: string | null, profilePath: string, declaredBy: PackageEntry['declaredBy']): PackageEntry {
  if (spec === null) {
    return {
      name, spec: null, declaredBy, source: 'host', status: 'supported',
      reason: 'HOST_BUNDLED', manualAction: 'The receiving Host supplies this bundle; it is not installed from the profile.',
    }
  }
  const source = sourceOf(spec)
  if (source === 'registry') {
    const version = installedVersion(profilePath, name)
    return {
      name, spec, declaredBy, source, status: 'supported', ...version === undefined ? {} : { installedVersion: version },
    }
  }
  if (source === 'tarball') {
    const target = specPath(profilePath, spec.slice('file:'.length))
    if (!existsSync(target)) {
      return {
        name, spec, declaredBy, source, status: 'unsupported', reason: 'TARBALL_MISSING',
        manualAction: `Publish ${basename(target)} to Gitea and declare its artifact URL + SHA256 before syncing.`,
      }
    }
    return {
      name, spec, declaredBy, source, status: 'inventory-only', reason: 'TARBALL_SOURCE_NOT_CONFIGURED',
      manualAction: 'Phase 0 records the file hash only. Publish the tgz to Gitea and record its URL + SHA256 before apply.',
      artifact: fingerprint(target, relative(profilePath, target).replaceAll('\\', '/')),
    }
  }
  if (source === 'link') {
    const target = specPath(profilePath, spec.slice('link:'.length))
    return {
      name, spec, declaredBy, source, status: 'unsupported', reason: 'LINK_DIRECTORY_NOT_SYNCED',
      manualAction: `Replace ${target} with a Gitea tarball or git commit; Phase 0 never copies a link: directory.`,
    }
  }
  if (source === 'workspace') {
    return {
      name, spec, declaredBy, source, status: 'unsupported', reason: 'WORKSPACE_DEPENDENCY_NOT_PORTABLE',
      manualAction: 'Publish the workspace package as a Gitea tarball; workspace:* cannot be recreated on another device.',
    }
  }
  return {
    name, spec, declaredBy, source, status: 'unsupported', reason: 'UNKNOWN_DEPENDENCY_SOURCE',
    manualAction: 'Use a registry version, a Gitea tarball, or a git commit.',
  }
}

function fileEntry(profilePath: string, name: string): FileEntry | undefined {
  const path = join(profilePath, name)
  if (!existsSync(path)) return undefined
  const hashed = fingerprint(path, name)
  return { path: name, sha256: hashed.sha256, bytes: hashed.bytes, status: 'supported',
    note: 'Patch file is hashed here; Phase 0 does not write it.' }
}

function configEntry(dshHome: string): ConfigEntry | undefined {
  const path = join(dshHome, 'config.yaml')
  if (!existsSync(path)) return undefined
  const text = readFileSync(path, 'utf8')
  const secretLikeKeys = [...new Set(text.split(/\r?\n/u)
    .map(line => /^\s*([A-Za-z0-9_.-]+)\s*:/u.exec(line)?.[1])
    .filter((key): key is string => key !== undefined && /(api[_-]?key|token|secret|password|credential)/iu.test(key)))]
  return {
    path: 'config.yaml', sha256: sha256(Buffer.from(text)), bytes: Buffer.byteLength(text), status: 'inventory-only',
    secretLikeKeys, note: 'Only hashes and key names are inventoried; values are never exported.',
  }
}

function skills(dshHome: string): SkillEntry[] {
  const root = join(dshHome, 'skills')
  if (!existsSync(root)) return []
  const rows: SkillEntry[] = []
  for (const name of readdirSync(root).sort()) {
    const path = join(root, name)
    const info = lstatSync(path)
    if (info.isSymbolicLink()) {
      rows.push({ name, kind: 'symlink', status: 'unsupported', target: readlinkSync(path),
        reason: 'SKILL_SYMLINK_NOT_PORTABLE', manualAction: 'Copy the skill content into the profile or publish it as a plugin; Phase 0 does not follow symlinks.' })
      continue
    }
    const hash = hashTree(path)
    rows.push({ name, kind: info.isDirectory() ? 'directory' : 'file', status: hash.symlinks === 0 ? 'supported' : 'unsupported',
      sha256: hash.sha256, files: hash.files, ...hash.symlinks === 0 ? {} : {
        reason: 'SKILL_CONTAINS_SYMLINKS', manualAction: 'Replace nested symlinks with regular files before syncing.',
      } })
  }
  return rows
}

function presets(dshHome: string): PresetEntry[] {
  const root = join(dshHome, '.agent-presets')
  if (!existsSync(root)) return []
  return readdirSync(root).sort().map((name) => {
    const path = join(root, name)
    const info = lstatSync(path)
    const hash = hashTree(path)
    return { name, kind: info.isDirectory() ? 'directory' : 'file', sha256: hash.sha256, files: hash.files }
  })
}

/**
 * Build a read-only inventory for one profile.
 * @param options - DSH home, profile name, base version, and optional fixed clock.
 * @returns Serialized inventory; no profile file is written.
 */
export function inventoryProfile(options: InventoryOptions): Inventory {
  const profilePath = join(options.dshHome, 'profiles', options.profileName)
  const packagePath = join(profilePath, 'package.json')
  if (!existsSync(packagePath)) throw new Error(`Profile package not found: ${packagePath}`)
  const manifest = readJson(packagePath) as unknown as ProfilePackage
  const dependencies = manifest.dependencies ?? {}
  const bundleNames = manifest.dsh?.profile?.bundles ?? []
  const bundleSet = new Set(bundleNames)
  const bundles = bundleNames.map(name => classify(name, dependencies[name] ?? null, profilePath, 'bundle'))
  const dependencyEntries = Object.entries(dependencies)
    .filter(([name]) => !bundleSet.has(name))
    .map(([name, spec]) => classify(name, spec, profilePath, 'dependency'))
  const unsupported: UnsupportedEntry[] = [...bundles, ...dependencyEntries]
    .filter(entry => entry.status === 'unsupported')
    .map(entry => ({
      area: entry.declaredBy,
      name: entry.name,
      reason: entry.reason ?? 'UNSUPPORTED',
      manualAction: entry.manualAction ?? 'Resolve manually.',
    }))
  const patches = ['cordis.patch.yml', 'cordis.yml', 'desktop.cordis.yml']
    .map(name => fileEntry(profilePath, name))
    .filter((entry): entry is FileEntry => entry !== undefined)
  const config = configEntry(options.dshHome)
  return {
    schemaVersion: 1,
    generatedAt: (options.now ?? new Date()).toISOString(),
    hostBaseVersion: options.hostBaseVersion,
    profile: { name: options.profileName, path: profilePath },
    bundles,
    dependencies: dependencyEntries,
    patches,
    ...config === undefined ? {} : { config },
    skills: skills(options.dshHome),
    presets: presets(options.dshHome),
    exclusions: EXCLUDED,
    unsupported,
  }
}

/** Render a human-readable inventory without exposing secret values. */
export function formatInventory(inventory: Inventory): string {
  const lines = [`Inventory ${inventory.profile.name} (base ${inventory.hostBaseVersion})`, `Profile: ${inventory.profile.path}`]
  const groups: Array<[string, PackageEntry[]]> = [['Bundles', inventory.bundles], ['Dependencies', inventory.dependencies]]
  for (const [label, entries] of groups) {
    lines.push(`${label} (${entries.length})`)
    for (const entry of entries) {
      const version = entry.installedVersion === undefined ? entry.spec ?? '' : `${entry.installedVersion} (${entry.spec ?? 'host'})`
      lines.push(`  [${entry.status}] ${entry.name} ${version}`)
      if (entry.reason !== undefined) lines.push(`       reason: ${entry.reason}`)
      if (entry.manualAction !== undefined) lines.push(`       manual: ${entry.manualAction}`)
    }
  }
  lines.push(`Patches (${inventory.patches.length})`)
  for (const patch of inventory.patches) lines.push(`  [${patch.status}] ${patch.path} ${patch.sha256.slice(0, 12)}…`)
  if (inventory.config !== undefined) {
    lines.push(`Config ${inventory.config.path}: secret-like keys = ${inventory.config.secretLikeKeys.join(', ') || '(none)'}`)
  }
  lines.push(`Skills (${inventory.skills.length})`)
  for (const skill of inventory.skills) lines.push(`  [${skill.status}] ${skill.name} (${skill.kind})`)
  lines.push(`Presets (${inventory.presets.length})`)
  if (inventory.unsupported.length > 0) {
    lines.push('Unsupported carriers')
    for (const item of inventory.unsupported) lines.push(`  [unsupported] ${item.area} ${item.name}: ${item.reason}`)
  }
  return lines.join('\n')
}
