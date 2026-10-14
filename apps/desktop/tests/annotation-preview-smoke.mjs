/** Real Desktop skill installation, live invocation, annotated editing and process restart regression. */
import assert from 'node:assert/strict'
import {serializeResponseAnnotations,parseResponseAnnotations} from '../../../packages/client/ui-primitives/src/response-annotations.ts'
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
const root = await mkdtemp(join(repo, '.artifacts', 'desktop-annotation-preview-smoke-'))
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

  await page.locator('[data-conversation-session="'+sessionIds[1]+'"]').waitFor({timeout:60000})
  await electronApp.evaluate(({BrowserWindow})=>{
    for(const w of BrowserWindow.getAllWindows()) if(w.webContents.getURL()==='dsh-app://app/') {
      w.removeAllListeners('show'); w.show();w.focus();w.webContents.focus()
    }
  })
  // A second real product window must receive the existing unread snapshot,
  // then acknowledge it for both windows when its conversation is viewed.
  await page.evaluate(async ({a,b})=>{
    await window.dshDesktop.completion.report({selected:b,ready:false,sessions:[{id:a,running:true}]})
    await window.dshDesktop.completion.report({selected:b,ready:false,sessions:[{id:a,running:false}]})
  },{a:sessionIds[0],b:sessionIds[1]})
  const doneSelector='[data-row-key="session:'+sessionIds[0]+'"] [data-state="done"]'
  await page.locator(doneSelector).waitFor()
  const otherEvent=electronApp.waitForEvent('window')
  await page.evaluate(id=>window.dshDesktop.sessions.openWindow(id),sessionIds[1])
  const other=await otherEvent
  await other.locator('[data-conversation-session="'+sessionIds[1]+'"]').waitFor({timeout:60000})
  await other.locator(doneSelector).waitFor()
  const otherWindow = await electronApp.browserWindow(other)
  await otherWindow.evaluate(w => { w.removeAllListeners('show'); w.show(); w.focus(); w.webContents.focus() })
  await other.locator('[data-row-key="session:'+sessionIds[0]+'"]').click()
  await other.locator('[data-conversation-session="'+sessionIds[0]+'"]').waitFor()
  await otherWindow.evaluate(w => { w.focus(); w.webContents.focus() })
  await other.locator(doneSelector).waitFor({state:'detached'})
  await page.locator(doneSelector).waitFor({state:'detached'})
  await other.close()
  await page.bringToFront()
  evidence.multiwindowUnread=true
  const modelButton=page.getByText('请选择模型',{exact:true})
  if(await modelButton.count()) {
    await modelButton.click()
    await page.getByRole('option').filter({hasText:'会话通信演示'}).first().click()
  }
  const editor=page.locator('[contenteditable="true"]').last()
  await editor.fill('ANNOTATION_REQUEST_TEST')
  async function selectPassage(needle, comment) {
    const paragraph=page.locator('[data-conversation-session="'+sessionIds[1]+'"] p').filter({hasText:needle}).first()
    await paragraph.evaluate(element=>{
      const range=document.createRange();range.selectNodeContents(element)
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range)
      element.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))
    })
    await page.getByRole('menuitem',{name:comment === undefined ? '添加到对话' : '添加注释',exact:true}).click()
    if(comment !== undefined) {
      const dialog=page.getByRole('dialog')
      await dialog.getByRole('textbox').fill(comment)
      await dialog.locator('[data-copy-math]').waitFor()
      await dialog.getByRole('button',{name:'添加注释',exact:true}).click()
    }
  }
  async function preview(count) {
    await page.locator('[data-draft-annotations]').getByRole('button',{name:count+' 条注释',exact:true}).hover()
    const card=page.locator('[data-annotation-preview]').last()
    await card.waitFor()
    return card
  }
  await page.setViewportSize({width:850,height:650})
  for(let i=0;i<4;i++) await selectPassage('这是会话互通体验版', ('LONG_REMARK_'+i+'\n').repeat(12))
  const longPreview=await preview(4)
  assert.ok(await longPreview.evaluate(el=>el.scrollHeight>el.clientHeight+100),'Long annotations must have a bounded scroll container')
  await longPreview.hover({position:{x:5,y:5}})
  await page.mouse.wheel(0,600)
  await page.waitForFunction(()=>document.querySelector('[data-annotation-preview]')?.scrollTop>0)
  await longPreview.focus()
  await page.keyboard.press('End')
  await page.waitForFunction(()=>{const el=document.querySelector('[data-annotation-preview]');return el&&el.scrollTop+el.clientHeight>=el.scrollHeight-2})
  await longPreview.getByRole('button',{name:'编辑评论',exact:true}).last().click()
  assert.equal(await page.getByRole('dialog').count(),0)
  assert.equal(await longPreview.getByRole('textbox').last().inputValue(),('LONG_REMARK_3\n').repeat(12))
  const scrollAgain=await preview(4)
  await scrollAgain.focus()
  await page.keyboard.press('End')
  await page.waitForFunction(()=>{const el=document.querySelector('[data-annotation-preview]');return el&&el.scrollTop>0})
  await scrollAgain.hover({position:{x:5,y:5}})
  await page.mouse.wheel(0,-10000)
  await page.waitForFunction(()=>document.querySelector('[data-annotation-preview]')?.scrollTop===0)
  await page.keyboard.press('Escape')
  await page.locator('[data-draft-annotations]').getByRole('button',{name:'清空所有注释',exact:true}).click()
  await page.locator('[data-draft-annotations]').waitFor({state:'detached'})
  await page.setViewportSize({width:1440,height:1000})
  await selectPassage('这是会话互通体验版', 'DIRECT_COMMENT_TEST')
  await selectPassage('安装后的正式会话使用')
  let card=await preview(2)
  assert.equal(await card.locator('blockquote').count(),2)
  await card.getByRole('button',{name:'编辑评论',exact:true}).first().click()
  assert.equal(await page.getByRole('dialog').count(),0)
  const inlineRemark=card.getByRole('textbox').first()
  await inlineRemark.fill('ANNOTATION_COMMENT_RETAINED')
  await page.mouse.move(2,2)
  // Outlast the 200ms pointer grace plus the 100ms dismissal fade.
  await page.waitForTimeout(450)
  assert.ok(await inlineRemark.isVisible(),'Focused remark must survive pointer exit')
  await inlineRemark.press('Enter')
  await page.keyboard.insertText('直接编辑中文备注')
  assert.ok((await inlineRemark.inputValue()).includes('\n直接编辑中文备注'))
  assert.equal(await editor.innerText(),'ANNOTATION_REQUEST_TEST')
  await inlineRemark.fill('ANNOTATION_COMMENT_RETAINED')
  await editor.click()
  await card.waitFor({state:'detached'})
  card=await preview(2)
  assert.equal(await card.getByRole('textbox').first().inputValue(),'ANNOTATION_COMMENT_RETAINED')
  await card.getByRole('button',{name:'移除注释',exact:true}).nth(1).click()
  await page.locator('[data-draft-annotations]').getByRole('button',{name:'1 条注释',exact:true}).waitFor()
  await page.locator('[data-draft-annotations]').getByRole('button',{name:'清空所有注释',exact:true}).click()
  await page.locator('[data-draft-annotations]').waitFor({state:'detached'})
  assert.equal(await editor.innerText(),'ANNOTATION_REQUEST_TEST')
  await selectPassage('这是会话互通体验版')
  await selectPassage('安装后的正式会话使用')
  await page.locator('[data-draft-annotations]').getByRole('button',{name:'2 条注释',exact:true}).click()
  let dialog=page.getByRole('dialog')
  await dialog.getByRole('textbox').first().fill('ANNOTATION_COMMENT_FINAL')
  await dialog.getByRole('button',{name:'移除注释',exact:true}).nth(1).click()
  await dialog.getByRole('button',{name:'完成',exact:true}).click()
  card=await preview(1)
  assert.equal(await card.getByRole('textbox').first().inputValue(),'ANNOTATION_COMMENT_FINAL')
  await page.screenshot({path:join(root,'annotation-preview-light.png')})
  await page.keyboard.press('Escape')
  await page.emulateMedia({colorScheme:'dark'})
  await page.setViewportSize({width:850,height:650})
  card=await preview(1)
  const bounds=await card.locator('..').evaluate(element=>{
    const r=element.getBoundingClientRect()
    return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}
  })
  assert.ok(bounds.left>=0&&bounds.top>=0&&bounds.right<=bounds.width+1&&bounds.bottom<=bounds.height+1,'Annotation preview must fit the window')
  await page.screenshot({path:join(root,'annotation-preview-dark.png')})
  await page.keyboard.press('Escape')
  await page.locator('[data-draft-annotations]').getByRole('button',{name:'1 条注释',exact:true}).click()
  dialog=page.getByRole('dialog')
  assert.equal(await dialog.getByRole('textbox').inputValue(),'ANNOTATION_COMMENT_FINAL')
  await page.screenshot({path:join(root,'annotation-comment-editor.png')})
  await page.keyboard.press('Escape')
  await editor.click()
  await page.keyboard.press('Enter')
  let received
  const modelDeadline=Date.now()+30000
  while(Date.now()<modelDeadline) {
    const messages=JSON.parse(await readFile(join(root,'skills-model-input.json'),'utf8'))
    const parsed=messages.filter(message=>message.role==='user').map(message=>
      parseResponseAnnotations(message.content.filter(block=>block.type==='text').map(block=>block.text).join(''))
    ).findLast(value=>value?.text.startsWith('ANNOTATION_REQUEST_TEST'))
    if(parsed){received=parsed;break}
    await new Promise(done=>setTimeout(done,100))
  }
  assert.ok(received,'The model must receive the annotated request')
  assert.equal(received.annotations.length,1)
  assert.equal(received.annotations[0].comment,'ANNOTATION_COMMENT_FINAL')
  assert.ok(received.annotations[0].text.includes('这是会话互通体验版'))
  assert.ok(received.annotations[0].sourceMessage)
  assert.ok(received.annotations[0].text.includes('$CNR < 1$'))
  assert.ok(received.annotations[0].text.includes('**对比度**'))
  await page.locator('[data-draft-annotations]').waitFor({state:'detached'})
  evidence.inlineRemarkEditing=true
  evidence.longAnnotationScroll=true
  evidence.passed=true
  evidence.preview=true;evidence.edit=true;evidence.deleteOne=true;evidence.clearAll=true
  evidence.requestPreserved=true;evidence.modelReceivedExactAnnotation=true;evidence.viewportFit=true
  await writeFile(join(repo,'.artifacts/annotation-preview-native-result.json'),JSON.stringify(evidence,null,2))
  console.log(JSON.stringify(evidence))
  await close()
} finally {
  if(ownedProcess?.pid && ownedProcess.exitCode===null && ownedProcess.signalCode===null) execFileSync('taskkill',['/PID',String(ownedProcess.pid),'/T','/F'],{windowsHide:true})
  await electronApp?.close().catch(()=>{})
}
