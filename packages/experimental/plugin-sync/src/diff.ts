/** Deterministic dry-run comparison of two read-only inventories. */
import type {
  DiffEntry, DiffResult, Inventory, PackageEntry,
} from './types.ts'

function packageRows(inventory: Inventory): Map<string, PackageEntry> {
  const rows = new Map<string, PackageEntry>()
  for (const entry of [...inventory.bundles, ...inventory.dependencies]) rows.set(entry.name, entry)
  return rows
}

function same(source: PackageEntry, target: PackageEntry): boolean {
  return source.source === target.source
    && source.installedVersion === target.installedVersion
    && source.spec === target.spec
}

/**
 * Compare source and target inventories without planning any write.
 * @param source - Desired profile inventory from the sending device.
 * @param target - Receiving device inventory.
 * @returns Rejections, per-package actions, and unsupported carriers.
 */
export function diffInventories(source: Inventory, target: Inventory): DiffResult {
  const rejections: string[] = []
  if (source.hostBaseVersion !== target.hostBaseVersion) {
    rejections.push(`TARGET_BASE_VERSION_MISMATCH: source ${source.hostBaseVersion}, target ${target.hostBaseVersion}`)
  }
  const sourceRows = packageRows(source)
  const targetRows = packageRows(target)
  const entries: DiffEntry[] = []
  for (const [name, sourceEntry] of [...sourceRows.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const targetEntry = targetRows.get(name)
    if (sourceEntry.status === 'unsupported') {
      entries.push({ name, declaredBy: sourceEntry.declaredBy, action: 'unsupported', source: sourceEntry,
        ...targetEntry === undefined ? {} : { target: targetEntry },
        ...sourceEntry.reason === undefined ? {} : { reason: sourceEntry.reason } })
      continue
    }
    if (sourceEntry.status === 'inventory-only') {
      entries.push({ name, declaredBy: sourceEntry.declaredBy, action: 'inventory-only', source: sourceEntry,
        ...targetEntry === undefined ? {} : { target: targetEntry },
        ...sourceEntry.reason === undefined ? {} : { reason: sourceEntry.reason } })
      continue
    }
    if (targetEntry === undefined) {
      entries.push({ name, declaredBy: sourceEntry.declaredBy, action: 'add', source: sourceEntry })
      continue
    }
    if (targetEntry.status === 'unsupported') {
      entries.push({ name, declaredBy: sourceEntry.declaredBy, action: 'unsupported', source: sourceEntry, target: targetEntry,
        ...targetEntry.reason === undefined ? {} : { reason: `TARGET_CARRIER_UNSUPPORTED: ${targetEntry.reason}` } })
      continue
    }
    entries.push({
      name, declaredBy: sourceEntry.declaredBy, action: same(sourceEntry, targetEntry) ? 'same' : 'update',
      source: sourceEntry, target: targetEntry,
    })
  }
  for (const [name, targetEntry] of [...targetRows.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (sourceRows.has(name)) continue
    entries.push({ name, declaredBy: targetEntry.declaredBy, action: 'remove', target: targetEntry })
  }
  const allUnsupported = [...source.unsupported, ...target.unsupported]
  const seen = new Set<string>()
  const uniqueUnsupported = allUnsupported.filter((item) => {
    const key = `${item.area}:${item.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const count = (action: DiffEntry['action']): number => entries.filter(entry => entry.action === action).length
  return {
    schemaVersion: 1,
    compatible: rejections.length === 0,
    rejections,
    sourceBaseVersion: source.hostBaseVersion,
    targetBaseVersion: target.hostBaseVersion,
    entries,
    unsupported: uniqueUnsupported,
    summary: {
      add: count('add'), update: count('update'), same: count('same'), remove: count('remove'),
      unsupported: count('unsupported'), inventoryOnly: count('inventory-only'),
    },
  }
}

/** Render the dry-run result for a terminal. */
export function formatDiff(result: DiffResult): string {
  const lines = [
    `Compatible: ${result.compatible ? 'yes' : 'NO'}`,
    `Base versions: source ${result.sourceBaseVersion}, target ${result.targetBaseVersion}`,
  ]
  if (result.rejections.length > 0) {
    lines.push('Rejections')
    for (const rejection of result.rejections) lines.push(`  [REJECTED] ${rejection}`)
  }
  lines.push('Changes')
  for (const entry of result.entries) {
    const label = entry.action === 'add' ? '+' : entry.action === 'update' ? '~' : entry.action === 'same' ? '='
      : entry.action === 'remove' ? '-' : '!'
    const version = entry.source?.installedVersion ?? entry.source?.spec ?? entry.target?.installedVersion ?? entry.target?.spec ?? ''
    lines.push(`  ${label} ${entry.name} ${version}${entry.reason === undefined ? '' : ` (${entry.reason})`}`)
  }
  if (result.unsupported.length > 0) {
    lines.push('Unsupported carriers (manual action required)')
    for (const item of result.unsupported) lines.push(`  [unsupported] ${item.area} ${item.name}: ${item.reason}`)
  }
  lines.push(`Summary: +${result.summary.add} ~${result.summary.update} =${result.summary.same} -${result.summary.remove} unsupported ${result.summary.unsupported} inventory-only ${result.summary.inventoryOnly}`)
  return lines.join('\n')
}
