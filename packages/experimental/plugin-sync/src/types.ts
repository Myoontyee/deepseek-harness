/** Read-only cross-device plugin inventory and dry-run diff contracts. */
export type InventoryStatus = 'supported' | 'inventory-only' | 'unsupported'

/** One file fingerprint; paths are relative to the profile or skill root. */
export interface FileFingerprint {
  path: string
  sha256: string
  bytes: number
}

/** Where a package declaration comes from. */
export type PackageSource = 'registry' | 'tarball' | 'link' | 'workspace' | 'host' | 'unknown'

/** One profile dependency or profile bundle declaration. */
export interface PackageEntry {
  name: string
  /** Dependency spec exactly as declared, or null for a host-provided bundle. */
  spec: string | null
  declaredBy: 'bundle' | 'dependency'
  source: PackageSource
  /** Version read from the installed package, when resolvable without installing. */
  installedVersion?: string
  status: InventoryStatus
  reason?: string
  manualAction?: string
  /** Content fingerprint for file:/link: sources only. */
  artifact?: FileFingerprint
}

/** One profile patch/configuration file. */
export interface FileEntry {
  path: string
  sha256: string
  bytes: number
  status: InventoryStatus
  note?: string
}

/** Sanitized MCP/global configuration metadata; values are never exported. */
export interface ConfigEntry {
  path: string
  sha256: string
  bytes: number
  status: InventoryStatus
  /** Key names that look secret-bearing; values are omitted. */
  secretLikeKeys: string[]
  note: string
}

/** One ~/.dsh/skills entry. */
export interface SkillEntry {
  name: string
  kind: 'directory' | 'file' | 'symlink'
  status: InventoryStatus
  /** Symlink target, or the recursive hash for a regular directory/file. */
  target?: string
  sha256?: string
  files?: number
  reason?: string
  manualAction?: string
}

/** One ~/.dsh/.agent-presets entry. */
export interface PresetEntry {
  name: string
  kind: 'directory' | 'file'
  sha256: string
  files: number
}

/** A carrier that this phase cannot synchronize. */
export interface UnsupportedEntry {
  area: 'bundle' | 'dependency' | 'skill' | 'config'
  name: string
  reason: string
  manualAction: string
}

/** Complete read-only inventory for one profile. */
export interface Inventory {
  schemaVersion: 1
  generatedAt: string
  hostBaseVersion: string
  profile: { name: string; path: string }
  bundles: PackageEntry[]
  dependencies: PackageEntry[]
  patches: FileEntry[]
  config?: ConfigEntry
  skills: SkillEntry[]
  presets: PresetEntry[]
  exclusions: string[]
  unsupported: UnsupportedEntry[]
}

/** One comparison row between source and target inventories. */
export interface DiffEntry {
  name: string
  declaredBy: 'bundle' | 'dependency'
  action: 'add' | 'update' | 'same' | 'remove' | 'unsupported' | 'inventory-only'
  source?: PackageEntry
  target?: PackageEntry
  reason?: string
}

/** Complete dry-run result; `compatible: false` must be shown as a rejection. */
export interface DiffResult {
  schemaVersion: 1
  compatible: boolean
  rejections: string[]
  sourceBaseVersion: string
  targetBaseVersion: string
  entries: DiffEntry[]
  unsupported: UnsupportedEntry[]
  summary: { add: number; update: number; same: number; remove: number; unsupported: number; inventoryOnly: number }
}
