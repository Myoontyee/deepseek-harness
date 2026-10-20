/** Explicit migration with a recovery journal through the Hosts' existing plugin/settings APIs. */
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'

export type MigrationRpc = (method: string, args: Record<string, unknown>) => Promise<unknown>
const bundleSchema = z.object({
  name: z.string(), version: z.string().optional(), source: z.string().optional(), enabled: z.boolean(), installed: z.boolean(),
  availability: z.enum(['installation', 'profile', 'missing']), optional: z.boolean().optional(),
})
const namespaceSchema = z.object({
  ns: z.string(), revision: z.number(), user: z.record(z.string(), z.json()).optional(),
  secrets: z.array(z.object({ path: z.array(z.string()), set: z.boolean() })),
})
const settingsSchema = z.object({ writable: z.boolean(), namespaces: z.array(namespaceSchema) })
type Bundle = z.infer<typeof bundleSchema>
type Value = z.infer<ReturnType<typeof z.json>>
export interface MigrationSnapshot { bundles: Bundle[]; settings: z.infer<typeof settingsSchema> }
export interface MigrationPlan {
  id: string
  fingerprint: string
  bundles: Array<{ name: string; spec?: string; enabled: boolean; before?: Bundle }>
  settings: Array<{ ns: string; patch: Record<string, Value>; revision: number; before: Record<string, Value> }>
  excluded: string[]
}
export interface MigrationReceipt { id: string; phase: 'prepared' | 'applying' | 'completed' | 'needs-review'; completed: string[]; pending?: string; message?: string; plan: MigrationPlan }
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
/** Read only the redacted, registered APIs; raw files and credentials never cross the wire. */
export async function migrationSnapshot(rpc: MigrationRpc): Promise<MigrationSnapshot> {
  const bundles = z.array(bundleSchema).parse(await rpc('pluginManager/listBundles', {}))
  const settings = settingsSchema.parse(await rpc('settings/describe', {}))
  return { bundles, settings }
}
function fingerprint(snapshot: MigrationSnapshot): string {
  return digest({ bundles: snapshot.bundles, settings: snapshot.settings.namespaces.map(n => ({ ns: n.ns, revision: n.revision })) })
}
/** Keep secret slots and machine-specific launch paths out of portable settings. */
function portable(value: Value, path: string[], blocked: string[][], skipped: string[]): Value | undefined {
  if (blocked.some(p => p.length <= path.length && p.every((key, i) => key === path[i]))) { skipped.push(path.join('.')); return undefined }
  const key = path.at(-1) ?? ''
  if (/password|secret|token|private.?key|credential/i.test(key) || /^(api.?key|authorization|cookie|env)$/i.test(key)) { skipped.push(path.join('.')); return undefined }
  if (typeof value === 'string' && (/^(?:[a-z]:[\\/]|\/|file:|link:|workspace:)/i.test(value) || /(?:localhost|127\.0\.0\.1|\[::1\])/.test(value) || /(?:Bearer\s|\bsk-[\w-]{12}|-----BEGIN .*PRIVATE KEY)/.test(value))) { skipped.push(path.join('.')); return undefined }
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    const url = new URL(value)
    if (url.username || url.password || url.search) { skipped.push(path.join('.')); return undefined }
  }
  if (Array.isArray(value)) {
    const result = value.map((v, i) => portable(v, [...path, String(i)], blocked, skipped))
    // Removing one array element would shift identities; omit the whole field instead.
    return result.some(v => v === undefined) ? undefined : result as Value[]
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, Value> = {}
    for (const [name, item] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error('Unsafe configuration key')
      const next = portable(item, [...path, name], blocked, skipped)
      if (next !== undefined) result[name] = next
    }
    return result
  }
  return value
}
/** Build an explicit additive plan; unsupported packages are listed, never silently replaced. */
export function planMigration(source: MigrationSnapshot, target: MigrationSnapshot): MigrationPlan {
  if (!target.settings.writable) throw new Error('目标电脑的配置不可写')
  const plan: MigrationPlan = { id: randomUUID(), fingerprint: fingerprint(target), bundles: [], settings: [], excluded: [] }
  const targetBundles = new Map(target.bundles.map(b => [b.name, b]))
  for (const item of source.bundles) {
    if (!item.installed && item.availability !== 'installation') continue
    const before = targetBundles.get(item.name)
    if (item.availability === 'installation') {
      if (before?.availability !== 'installation' || before.version !== item.version) throw new Error(`${item.name}: 两端内置版本不同，请先统一底座`)
      if (item.optional && before.enabled !== item.enabled) plan.bundles.push({ name: item.name, enabled: item.enabled, before })
      continue
    }
    if (!item.version || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(item.version) || !/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(item.name) || !item.source || !new RegExp('^' + item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:@[^/\\\\]+)?$').test(item.source)) {
      plan.excluded.push(`${item.name}: 本地目录、tarball 或 Git 来源需要先发布固定版本制品`); continue
    }
    if (before?.version !== item.version || !before.installed) plan.bundles.push({ name: item.name, spec: `${item.name}@${item.version}`, enabled: item.enabled, ...(before ? { before } : {}) })
    else if (before.enabled !== item.enabled) plan.bundles.push({ name: item.name, enabled: item.enabled, before })
  }
  const namespaces = new Map(target.settings.namespaces.map(n => [n.ns, n]))
  for (const item of source.settings.namespaces) {
    if (!item.user || !Object.keys(item.user).length) continue
    const before = namespaces.get(item.ns)
    if (!before) { plan.excluded.push(`${item.ns}: 目标未注册此配置，先安装对应插件后重新预览`); continue }
    const excluded: string[] = []
    const patch = portable(item.user, [], [...item.secrets, ...before.secrets].map(s => s.path), excluded) as Record<string, Value>
    plan.excluded.push(...excluded.map(key => `${item.ns}.${key}: 凭据或本机专属字段保留在原设备`))
    if (patch && Object.keys(patch).length) plan.settings.push({ ns: item.ns, patch, revision: before.revision, before: before.user ?? {} })
  }
  return plan
}
/** Apply once with a durable journal. Unknown outcomes stop the run instead of replaying writes. */
export async function applyMigration(
  plan: MigrationPlan, rpc: MigrationRpc, save: (receipt: MigrationReceipt) => void,
): Promise<MigrationReceipt> {
  const receipt: MigrationReceipt = { id: plan.id, phase: 'prepared', completed: [], plan }
  save(receipt)
  try {
    if (fingerprint(await migrationSnapshot(rpc)) !== plan.fingerprint) throw new Error('目标配置已变化，请重新预览')
    const sessions = z.object({ items: z.array(z.object({ running: z.boolean().optional() })) }).parse(await rpc('session/list', { _request: {} }))
    if (sessions.items.some(s => s.running)) throw new Error('目标电脑仍有运行中的任务，请结束后再迁移')
    receipt.phase = 'applying'
    for (const item of plan.bundles) {
      receipt.pending = `plugin:${item.name}`; save(receipt)
      const result = await rpc(item.spec ? 'pluginManager/installBundle' : 'pluginManager/setBundleEnabled', item.spec ? { spec: item.spec, options: { enabled: item.enabled, saveExact: true, requestId: `${plan.id}:${item.name}` } } : { name: item.name, enabled: item.enabled })
      const changed = z.object({ application: z.string(), error: z.unknown().optional() }).parse(result)
      if (!['applied', 'restart-required'].includes(changed.application) || changed.error) throw new Error(`${item.name}: 安装未确认完成，请在目标插件页检查`)
      receipt.completed.push(receipt.pending); delete receipt.pending; save(receipt)
      if (changed.application === 'restart-required') throw new Error('插件已写入，目标需要重启；重启后重新预览其余配置')
    }
    for (const item of plan.settings) {
      receipt.pending = `settings:${item.ns}`; save(receipt)
      await rpc('settings/update', { ns: item.ns, patch: item.patch, expectedRevision: item.revision })
      receipt.completed.push(receipt.pending); delete receipt.pending; save(receipt)
    }
    receipt.phase = 'completed'; save(receipt)
  } catch (error) {
    receipt.phase = 'needs-review'; receipt.message = error instanceof Error ? error.message : '迁移未完成，请检查目标状态'; save(receipt)
  }
  return receipt
}
