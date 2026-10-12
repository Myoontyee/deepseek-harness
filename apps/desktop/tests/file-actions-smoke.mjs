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
const root = await mkdtemp(join(repo, '.artifacts', 'desktop-file-actions-smoke-'))
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
await mkdir(join(root,'workspace','资料'),{recursive:true})
await writeFile(join(root,'workspace','资料','示例.md'),'# 中文测试\nneedle-file-actions\n')
await writeFile(join(root,'workspace','recycle-me.txt'),'disposable smoke fixture')
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

  await page.locator('[data-conversation-session="'+sessionIds[1]+'"]').waitFor({timeout:60000})
  await electronApp.evaluate(async ({clipboard,ClipboardItem}, testRoot)=>{
    globalThis.__clipboardTestRoot=testRoot
    globalThis.__clipboardBackup=await Promise.all((await clipboard.read()).filter(item=>item.types.length>0).map(async item=>new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type=>[type,await item.getType(type)]))))))
  },root)
  await electronApp.evaluate(({BrowserWindow})=>{
    for(const w of BrowserWindow.getAllWindows()) if(w.webContents.getURL()==='dsh-app://app/') {
      w.removeAllListeners('show');w.show();w.focus();w.webContents.focus()
    }
  })
  async function copied(){
    const deadline=Date.now()+5000
    while(Date.now()<deadline){
      if(await electronApp.evaluate(({clipboard})=>clipboard.readText())==='资料/示例.md') return
      await new Promise(done=>setTimeout(done,100))
    }
    throw new Error('File path was not copied; clipboard contents intentionally omitted')
  }
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  console.log('expand buttons',await page.locator('[data-sidebar-right-expand]').count())
  await page.locator('[data-sidebar-right-expand]').last().click()
  await page.locator('[data-sidebar-right-guide-entry="files"]').click()
  const tree=page.locator('[data-files-state="tree"]').last()
  await tree.waitFor({timeout:30000})
  await tree.getByRole('button',{name:'资料',exact:true}).click()
  const row=tree.getByRole('button',{name:'示例.md',exact:true})
  await row.waitFor()
  await row.click({button:'right'})
  await page.getByRole('menuitem',{name:'复制相对路径'}).click()
  await copied()
  await electronApp.evaluate(async ({clipboard})=>clipboard.writeText('dsh-file-actions-test'))
  await row.focus()
  await page.keyboard.press('Control+Shift+c')
  await copied()
  await row.click({button:'right'})
  await page.getByRole('menuitem',{name:'添加到对话',exact:true}).click()
  await page.locator('[contenteditable="true"]').last().waitFor()
  assert.ok((await page.locator('[contenteditable="true"]').last().innerText()).includes('示例.md'))
  await row.click()
  await page.getByRole('button',{name:'复制路径选项',exact:true}).waitFor()
  await electronApp.evaluate(async ({clipboard})=>clipboard.writeText('dsh-file-actions-test'))
  await page.getByRole('button',{name:'复制路径选项',exact:true}).click()
  await page.getByRole('menuitem',{name:'复制相对路径'}).click()
  await copied()
  await page.getByRole('button',{name:'在文件树中定位',exact:true}).click()
  await row.waitFor()
  await row.focus()
  await page.keyboard.press('F2')
  let dialog=page.getByRole('dialog')
  await dialog.getByRole('textbox').fill('重命名.md')
  await dialog.getByRole('button',{name:'确定',exact:true}).click()
  await tree.getByRole('button',{name:'重命名.md',exact:true}).waitFor()
  assert.ok((await readFile(join(root,'workspace','资料','重命名.md'),'utf8')).includes('needle'))
  await tree.getByRole('button',{name:'资料',exact:true}).click({button:'right'})
  await page.getByRole('menuitem',{name:'新建文件…',exact:true}).click()
  dialog=page.getByRole('dialog')
  await dialog.getByRole('textbox').fill('created.txt')
  await dialog.getByRole('button',{name:'确定',exact:true}).click()
  await tree.getByRole('button',{name:'created.txt',exact:true}).waitFor()
  await tree.getByRole('button',{name:'recycle-me.txt',exact:true}).focus()
  await page.keyboard.press('Delete')
  await page.getByRole('dialog').getByRole('button',{name:'确定',exact:true}).click()
  await tree.getByRole('button',{name:'recycle-me.txt',exact:true}).waitFor({state:'detached'})
  await assert.rejects(access(join(root,'workspace','recycle-me.txt')))
  await tree.getByRole('button',{name:'重命名.md',exact:true}).click({button:'right'})
  await page.getByRole('menuitem',{name:'复制',exact:true}).click()
  await tree.getByRole('button',{name:'资料',exact:true}).click({button:'right'})
  await page.getByRole('menuitem',{name:'粘贴…',exact:true}).click()
  dialog=page.getByRole('dialog')
  await dialog.getByRole('textbox').fill('副本.md')
  await dialog.getByRole('button',{name:'确定',exact:true}).click()
  await tree.getByRole('button',{name:'副本.md',exact:true}).waitFor()
  assert.ok((await readFile(join(root,'workspace','资料','副本.md'),'utf8')).includes('needle'))
  await tree.getByRole('button',{name:'资料',exact:true}).click({button:'right'})
  await page.getByRole('menuitem',{name:'在文件夹中查找…',exact:true}).click()
  dialog=page.getByRole('dialog')
  await dialog.getByRole('textbox').fill('needle-file-actions')
  await dialog.getByRole('button',{name:'确定',exact:true}).click()
  await dialog.getByRole('button').filter({hasText:'重命名.md:2'}).waitFor()
  await dialog.getByRole('button',{name:'取消',exact:true}).last().click()
  await tree.getByRole('button',{name:'资料',exact:true}).click({button:'right'})
  await page.getByRole('menuitem',{name:'在集成终端中打开',exact:true}).click()
  await page.locator('.xterm').last().waitFor({timeout:30000})
  assert.deepEqual(errors,[])
  evidence.passed=true
  evidence.fileActions=['relative-path-menu','relative-path-keyboard','add-reference','preview-toolbar','locate-tree','rename','create','recycle','copy-paste','search','terminal']
  await writeFile(join(repo,'.artifacts/file-actions-native-result.json'),JSON.stringify(evidence,null,2))
  console.log(JSON.stringify(evidence))
  await electronApp.evaluate(async ({clipboard})=>{
    if(['资料/示例.md','dsh-file-actions-test'].includes(await clipboard.readText()) || (await clipboard.readText()).replaceAll('\\\\','/').startsWith(globalThis.__clipboardTestRoot.replaceAll('\\\\','/'))) {
      if(globalThis.__clipboardBackup.length) await clipboard.write(globalThis.__clipboardBackup)
      else clipboard.clear()
    }
  })
  await close()
} finally {
  await electronApp?.evaluate(async ({clipboard})=>{
    if(globalThis.__clipboardBackup && (['资料/示例.md','dsh-file-actions-test'].includes(await clipboard.readText()) || (await clipboard.readText()).replaceAll('\\\\','/').startsWith(globalThis.__clipboardTestRoot.replaceAll('\\\\','/')))) {
      if(globalThis.__clipboardBackup.length) await clipboard.write(globalThis.__clipboardBackup)
      else clipboard.clear()
    }
  }).catch(()=>{})
  if(ownedProcess?.pid && ownedProcess.exitCode===null && ownedProcess.signalCode===null) execFileSync('taskkill',['/PID',String(ownedProcess.pid),'/T','/F'],{windowsHide:true})
  await electronApp?.close().catch(()=>{})
}
