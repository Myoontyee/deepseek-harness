/** Native confirmation and encrypted recovery journal for paired-computer migration. */
import { app, dialog, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { migrationSnapshot, planMigration, applyMigration, type MigrationRpc } from './profile-migration.ts'
import { peerJson } from './peer-transport.ts'

const responseSchema = z.object({ result: z.object({
  ok: z.boolean(), value: z.unknown().optional(), error: z.object({ message: z.string() }).optional(),
}) })
function unwrap(raw: unknown): unknown {
  const response = responseSchema.parse(raw).result
  if (!response.ok) throw new Error(response.error?.message ?? '设备拒绝迁移请求')
  return response.value
}
/** Preview on the controlling computer, then use the target's ordinary management APIs. */
export async function migrateToComputer(
  host: { url: string; cookie: string },
  peer: { name: string; url: string; pin: string; token: string },
): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密服务不可用，无法保存恢复记录')
  const local: MigrationRpc = async (method, args) => {
    const url = new URL(`/api/${method}`, host.url)
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('无效的本机服务地址')
    const response = await fetch(url, { method: 'POST', headers: { cookie: host.cookie, 'content-type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(25000), body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }) })
    if (!response.ok) throw new Error('无法读取本机插件配置')
    return unwrap(await response.json())
  }
  const remote: MigrationRpc = async (method, args) => unwrap(await peerJson(peer.url, peer.pin, `/api/${method}`,
    { type: 'client-request', rpcId: randomUUID(), method, payload: { args } }, peer.token, method === 'pluginManager/installBundle' ? 600000 : 25000))
  const source = await migrationSnapshot(local), target = await migrationSnapshot(remote)
  const plan = planMigration(source, target)
  const detail = [
    `方向：本机 → ${peer.name}`,
    `插件：${plan.bundles.length} 项；配置：${plan.settings.length} 项`,
    '只通过目标现有插件和配置接口写入；不会删除目标独有插件。目标中的同名偏好会合并更新。',
    '凭据、设备授权、机器专属路径不迁移。本地未发布插件和自定义文件会列为未迁移项。',
    ...plan.bundles.slice(0,12).map(item => `• ${item.name}`),
    ...plan.settings.slice(0,12).map(item => `• ${item.ns}`),
    ...(plan.excluded.length ? [`\n未迁移 ${plan.excluded.length} 项：`, ...plan.excluded.slice(0,16)] : []),
    '应用前保存加密恢复记录；中途失败会停止并保留已完成项，不会声称整体回滚。',
  ].join('\n')
  const approved = await dialog.showMessageBox({ type: 'question', title: '迁移插件与配置', message: `迁移到 ${peer.name}`,
    detail, buttons: ['取消', '迁移可迁移项'], defaultId: 0, cancelId: 0, noLink: true })
  if (approved.response !== 1 || !plan.bundles.length && !plan.settings.length) return
  const folder = join(app.getPath('userData'), 'profile-migrations'); mkdirSync(folder, { recursive: true })
  const path = join(folder, `${plan.id}.dat`)
  const receipt = await applyMigration(plan, remote, (value) => {
    const temporary = path + '.tmp'
    const encrypted = safeStorage.encryptString(JSON.stringify({ peer: { name: peer.name, url: peer.url }, ...value }))
    writeFileSync(temporary, encrypted, { mode: 0o600 })
    renameSync(temporary, path)
  })
  await dialog.showMessageBox({ type: receipt.phase === 'completed' ? 'info' : 'warning', title: '迁移插件与配置',
    message: receipt.phase === 'completed' ? '可迁移项已应用' : '迁移未全部完成',
    detail: [`已确认完成 ${receipt.completed.length} 项`, receipt.message ?? '', receipt.pending ? `需在目标核查：${receipt.pending}` : '', `未迁移项：${plan.excluded.length}`, `恢复记录：${path}`, '需要的账号/API 凭据请在目标电脑配置。'].filter(Boolean).join('\n') })
}
