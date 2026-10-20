import { describe, expect, it, vi } from 'vitest'
import { applyMigration, planMigration, type MigrationSnapshot, type MigrationRpc } from '../src/profile-migration.ts'
const ns = (user: Record<string, string>, revision = 1) => ({ ns: 'chat', revision, user, secrets: [] })
const snapshot = (user: Record<string, string> = {}): MigrationSnapshot => ({
  bundles: [], settings: { writable: true, namespaces: [ns(user)] },
})
describe('paired profile migration', () => {
  it('excludes secrets and machine paths while retaining portable preferences', () => {
    const source = snapshot({ theme: 'dark', apiKey: 'private', path: 'C:/local/private', baseURL: 'http://127.0.0.1:8045/v1', endpoint: 'https://example.com/?token=hidden' })
    const target = snapshot({ theme: 'light' })
    const plan = planMigration(source, target)
    expect(plan.settings[0]?.patch).toEqual({ theme: 'dark' })
    expect(plan.excluded).toHaveLength(4)
    expect(JSON.stringify(plan.settings[0]?.patch)).not.toContain('private')
  })
  it('respects schema secret paths even when their names look harmless', () => {
    const source = snapshot({ value: 'private', theme: 'dark' })
    source.settings.namespaces[0]!.secrets = [{ path: ['value'], set: true }]
    expect(planMigration(source, snapshot()).settings[0]?.patch).toEqual({ theme: 'dark' })
  })
  it('rejects a base mismatch and inventories unsupported local bundles', () => {
    const source = snapshot(), target = snapshot()
    source.bundles.push({ name: '@dsh/base', version: '1.0.0', availability: 'installation', installed: false, enabled: true })
    expect(() => planMigration(source, target)).toThrow('统一底座')
    source.bundles = [{ name: 'local-plugin', version: '1.0.0', source: 'file:C:/plugin.tgz', installed: true, enabled: true, availability: 'profile' }]
    const plan = planMigration(source, target)
    expect(plan.bundles).toHaveLength(0)
    expect(plan.excluded[0]).toContain('固定版本')
  })
  it('plans fixed-version registry installation without deleting target-only bundles', () => {
    const source = snapshot(), target = snapshot()
    source.bundles.push({ name: '@scope/plugin', version: '1.2.3', source: '@scope/plugin@^1.0.0', installed: true, enabled: true, availability: 'profile' })
    target.bundles.push({ name: 'target-only', version: '1.0.0', installed: true, enabled: true, availability: 'profile' })
    expect(planMigration(source,target).bundles).toEqual([{ name: '@scope/plugin', spec: '@scope/plugin@1.2.3', enabled: true }])
  })
  it('stops before writes when target changed or tasks are running', async () => {
    const target=snapshot(), plan=planMigration(snapshot({ theme:'dark' }),target)
    const rpc=vi.fn<MigrationRpc>(async method=>method==='pluginManager/listBundles'?[]:method==='settings/describe'?{ ...target.settings,namespaces:[ns({},2)] }:{ items:[] })
    const save=vi.fn()
    expect((await applyMigration(plan,rpc,save)).phase).toBe('needs-review')
    expect(rpc.mock.calls.some(([method])=>method==='settings/update')).toBe(false)
    rpc.mockImplementation(async method=>method==='pluginManager/listBundles'?[]:method==='settings/describe'?target.settings:{ items:[{ running:true }] })
    expect((await applyMigration(plan,rpc,save)).message).toContain('运行中的任务')
  })
  it('journals unknown outcomes and never retries a write on timeout', async () => {
    const target=snapshot(), plan=planMigration(snapshot({ theme:'dark' }),target)
    const rpc=vi.fn<MigrationRpc>(async (method)=>{
      if(method==='pluginManager/listBundles')return []
      if(method==='settings/describe')return target.settings
      if(method==='session/list')return { items:[] }
      throw new Error('connection lost after request')
    })
    const writes: string[]=[]
    const result=await applyMigration(plan,rpc,r=>writes.push(JSON.stringify(r)))
    expect(result.phase).toBe('needs-review')
    expect(result.pending).toBe('settings:chat')
    expect(rpc.mock.calls.filter(([method])=>method==='settings/update')).toHaveLength(1)
    expect(JSON.parse(writes[0]!).phase).toBe('prepared')
  })
  it('applies settings with a revision check and records confirmed completion', async()=>{
    const target=snapshot(),plan=planMigration(snapshot({ theme:'dark' }),target)
    const rpc=vi.fn<MigrationRpc>(async method=>method==='pluginManager/listBundles'?[]:method==='settings/describe'?target.settings:method==='session/list'?{ items:[] }:{})
    const result=await applyMigration(plan,rpc,()=>{})
    expect(result.phase).toBe('completed')
    expect(rpc).toHaveBeenCalledWith('settings/update',{ ns:'chat',patch:{ theme:'dark' },expectedRevision:1 })
    expect(result.completed).toEqual(['settings:chat'])
  })
})
