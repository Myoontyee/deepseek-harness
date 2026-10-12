/** Real Desktop skill installation, live invocation, annotated editing and process restart regression. */
import assert from 'node:assert/strict'
import {serializeResponseAnnotations} from '../../../packages/client/ui-primitives/src/response-annotations.ts'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, realpath, symlink, writeFile, access } from 'node:fs/promises'
import { appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const { _electron } = createRequire(new URL('../../web/package.json', import.meta.url))('playwright')

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const desktop = join(repo, 'apps/desktop')
const root = await mkdtemp(join(repo, '.artifacts', 'desktop-skills-smoke-'))
const application = join(root, 'app')
const project = join(application, '.desktop-build/development/project')
const profile = join(root, 'home/profiles/desktop')
const userData = join(root, 'electron-user-data')
const primaryRuntime = process.env.DSH_DESKTOP_PRIMARY_RUNTIME_DIR
  ?? join(desktop, '.desktop-build/targets/win-x64/runtime/primary-runtime')
const sessionIds = [0, 1, 2].map(index => `desktop-demo-${index}-${randomUUID()}`)
const manifest = JSON.parse(await readFile(join(desktop, 'package.json'), 'utf8'))
const executable = join(desktop, '.desktop-build/targets/win-x64/electron/electron.exe')
const { createPluginProfile } = await import(pathToFileURL(join(desktop, 'lib/types/project-manager.js')).href)
const { prepareDevelopmentProject } = await import(pathToFileURL(join(desktop, 'scripts/development-project.ts')).href)
const { DESKTOP_HOST_PROTOCOL_VERSION } = await import(pathToFileURL(join(desktop, 'lib/types/host-protocol.js')).href)
const pnpm = JSON.parse(await readFile(join(desktop, 'node_modules/pnpm/package.json'), 'utf8'))
await access(join(desktop, 'lib/main.js'))
await access(primaryRuntime)
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(?:path|systemroot|windir|comspec|pathext)$/iu.test(name)))
const release = { schemaVersion: 1, version: manifest.version,
  nodeVersion: execFileSync(executable, ['-p', 'process.versions.node'], {
    encoding: 'utf8', env: { ...environment, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true,
  }).trim(), pnpmVersion: pnpm.version, hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION }
await mkdir(join(root, 'workspace'), { recursive: true })
await mkdir(userData, { recursive: true })
assert.ok(resolve(project).startsWith(`${resolve(root)}${sep}`), 'The disposable development project must stay inside this smoke run')
prepareDevelopmentProject({ projectDir: project, cliDir: join(repo, 'apps/cli'), hostDir: join(repo, 'apps/desktop-host'), dependencyDir: join(repo, 'node_modules/.pnpm/node_modules'), release, target: 'win-x64' })
createPluginProfile(profile)
await cp(join(desktop, 'lib'), join(application, 'lib'), { recursive: true })
await cp(join(desktop, 'renderer'), join(application, 'renderer'), { recursive: true })
await cp(join(desktop, 'resources'), join(application, 'resources'), { recursive: true })
await cp(join(desktop, 'scripts/node-bin'), join(application, 'scripts/node-bin'), { recursive: true })
await writeFile(join(application, 'package.json'), JSON.stringify({
  name: `dsh-session-links-smoke-${randomUUID()}`, version: manifest.version, type: 'module', main: 'smoke-entry.mjs',
}))
// Test-only visibility control: exercise the real windows and renderer without taking the user's desktop focus.
await writeFile(join(application, 'smoke-entry.mjs'), `import { app, dialog } from 'electron'\ndialog.showMessageBox = async (_window, options) => { console.error('TEST_DIALOG', JSON.stringify(options ?? _window)); return {response:0,checkboxChecked:false} }\nimport { writeFileSync } from 'node:fs'\nimport { join } from 'node:path'\napp.on('browser-window-created', (_event, window) => { window.webContents.setBackgroundThrottling(false); window.on('show', () => window.hide()); window.setTitle('DeepSeek Harness — 会话互通体验版') })\napp.on('second-instance', () => { writeFileSync(join(process.env.DSH_SESSION_LINK_SMOKE_ROOT, 'second-instance.json'), JSON.stringify({ ownerPid: process.pid })) })\nawait import('./lib/main.js').catch(error => { console.error(error); app.exit(1) })\n`)
for (const name of Object.keys(manifest.dependencies)) {
  const destination = join(application, 'node_modules', name)
  await mkdir(dirname(destination), { recursive: true })
  await symlink(await realpath(join(desktop, 'node_modules', name)), destination, 'junction')
}
await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify([
  { id: 'webserver', config: { host: '127.0.0.1', port: 0 } },
  { id: 'llm-deepseek', disabled: true }, { id: 'session-title-llm', disabled: true },
  { id: 'session-telemetry-otel', disabled: true },
  { id: 'agent-preset-registry', config: { default: 'standard' } },
  { insert: [{ id: 'session-link-smoke', name: new URL('./fixtures/skills-settings-host.mjs', import.meta.url).href }] },
]))
const env = { ...environment, DSH_HOME: join(root, 'home'), USERPROFILE: root, HOME: root,
  TEMP: root, TMP: root, TMPDIR: root, DSH_SESSION_LINK_SMOKE_ROOT: root,
  DSH_SESSION_LINK_SMOKE_IDS: JSON.stringify(sessionIds), DSH_DESKTOP_PRIMARY_RUNTIME_DIR: primaryRuntime,
  DSH_DESKTOP_PNPM_ENTRY: join(desktop, 'node_modules/pnpm/bin/pnpm.mjs'), DSH_DESKTOP_OPEN_DEVTOOLS: '0',
}
const args = [application, `--user-data-dir=${userData}`, '--lang=zh-CN']

env.DSH_SESSION_LINK_MENU_DEMO = '1'
let electronApp
let ownedProcess
const evidence = { passed: false, root, restarts: [], sameSession: sessionIds[1] }
async function close() {
  if (!electronApp) return
  const pid = ownedProcess?.pid
  console.log('Closing isolated Desktop process', pid)
  await electronApp.evaluate(({dialog}) => { dialog.showMessageBox = async () => ({response:0,checkboxChecked:false}) })
  let timer
  try {
    await Promise.race([electronApp.close(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Desktop did not quit within 45 seconds')), 45000)
    })])
  } finally { clearTimeout(timer) }
  assert.ok(ownedProcess.exitCode !== null || ownedProcess.signalCode !== null, 'Electron process must exit before relaunch')
  evidence.restarts.push({ pid, exited: true })
  electronApp = undefined
}
try {
  await writeFile(join(root,'annotation-seed.txt'),serializeResponseAnnotations('Review this selected change',[{text:'ANNOTATION_QUOTE_MARKER: before 193497; after 109384',comment:'ANNOTATION_COMMENT_MARKER: apply only this change',sourceUrl:'dsh://session/'+sessionIds[1],sourceLabel:'Current conversation',sourceMessage:'fixture-source'}]))
  const zip = createRequire(join(repo, 'packages/api/session-controller/package.json'))('fflate')
  const skill = '---\nname: hot-skill\ndescription: Hot reload integration test\n---\nSKILL_HOT_RELOAD_MARKER'
  const archive = join(root, 'test-skill.zip')
  await writeFile(archive, zip.zipSync({ 'demo/SKILL.md': zip.strToU8(skill) }))
  electronApp = await _electron.launch({executablePath:executable,args:[...args,'dsh://session/'+encodeURIComponent(sessionIds[1])],cwd:root,env,timeout:120000})
  ownedProcess = electronApp.process()
  ownedProcess.stderr.on('data', bytes => appendFileSync(join(root, 'process-stderr.log'), bytes))
  let page
  const deadline = Date.now()+120000
  while(Date.now()<deadline) {
    for(const window of electronApp.windows()) if(window.url().endsWith('/welcome.html')) await window.evaluate(()=>window.dshWelcome.skip()).catch(()=>{})
    page=electronApp.windows().find(window=>window.url()==='dsh-app://app/')
    if(page && await page.locator('[data-conversation-session="'+sessionIds[1]+'"]').count()) break
    await new Promise(done=>setTimeout(done,250))
  }
  assert.ok(page)
  await page.getByRole('button',{name:'编辑消息',exact:true}).waitFor({timeout:30000})
  await page.getByText('更多',{exact:true}).click()
  await page.getByText('设置',{exact:true}).last().click()
  await page.getByText('技能',{exact:true}).first().click()
  const settings=page.getByRole('region',{name:'技能',exact:true})
  await settings.locator('input[type=file]').setInputFiles(archive)
  await settings.getByRole('button',{name:'查看 / 安装',exact:true}).click()
  await settings.getByText('SKILL_HOT_RELOAD_MARKER',{exact:false}).waitFor()
  await settings.getByRole('button',{name:'安装到 DSH',exact:true}).click()
  await settings.getByRole('status').filter({hasText:'已应用'}).waitFor()
  await settings.getByRole('button',{name:'已安装',exact:true}).click()
  await settings.getByText('hot-skill',{exact:true}).waitFor()
  console.log('Installed ZIP skill in live Desktop')
  await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'编辑消息',exact:true}).click()
  const editor=page.getByRole('textbox',{name:'编辑消息',exact:true})
  await editor.fill('/hot')
  try { await page.getByRole('option').filter({hasText:'/hot-skill'}).click() }
  catch(error) { await writeFile(join(root,'editor-debug.txt'),await page.locator('body').innerText()); throw error }
  assert.equal(await editor.inputValue(),'/hot-skill ')
  await page.getByRole('button',{name:'保存并重新生成',exact:true}).click()
  await editor.waitFor({state:'hidden'})
  await page.getByRole('button',{name:'编辑消息',exact:true}).waitFor({timeout:30000})
  const model=await readFile(join(root,'skills-model-input.json'),'utf8')
  assert.ok(model.includes('ANNOTATION_QUOTE_MARKER') && model.includes('ANNOTATION_COMMENT_MARKER'))
  assert.ok(model.includes('targets of the request after this block'))
  assert.ok(model.includes('SKILL_HOT_RELOAD_MARKER'),'installed skill must reach the next model request without restart')
  await page.getByRole('button',{name:'编辑消息',exact:true}).click()
  await editor.fill('/permission')
  await page.getByRole('option').filter({hasText:'/permission'}).first().click()
  await page.getByRole('button',{name:'执行命令',exact:true}).click()
  await editor.waitFor({state:'hidden'})
  await close()
  electronApp = await _electron.launch({executablePath:executable,args:[...args,'dsh://session/'+encodeURIComponent(sessionIds[1])],cwd:root,env:{...env,DSH_EDIT_RESTART:'1'},timeout:120000})
  ownedProcess=electronApp.process()
  let restarted
  const restartDeadline=Date.now()+60000
  while(Date.now()<restartDeadline) {
    restarted=electronApp.windows().find(window=>window.url()==='dsh-app://app/')
    if(restarted) break
    await new Promise(done=>setTimeout(done,200))
  }
  assert.ok(restarted)
  await restarted.getByRole('button',{name:'编辑消息',exact:true}).waitFor({timeout:60000})
  evidence.reopened=true
  evidence.passed=true
  console.log('Model received newly installed skill; edited command completed; restart passed')
  evidence.annotationGuidance=true
  evidence.hotReloadModel=true
  evidence.editSkill=true
  evidence.editCommand=true
  await writeFile(join(repo,'.artifacts/skills-native-result.json'),JSON.stringify(evidence,null,2))
  console.log(JSON.stringify(evidence))
  await close()
} finally {
  if(ownedProcess?.pid && ownedProcess.exitCode===null && ownedProcess.signalCode===null) execFileSync('taskkill',['/PID',String(ownedProcess.pid),'/T','/F'],{windowsHide:true})
  await electronApp?.close().catch(()=>{})
}
