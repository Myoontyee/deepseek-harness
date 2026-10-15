/** Windows Desktop composition: review, visual Git, persisted SSH settings and interactive remote terminals. */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, realpath, symlink, writeFile, appendFile, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const { _electron, chromium } = createRequire(new URL('../../web/package.json', import.meta.url))('playwright')

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
if(process.platform!=='win32')throw new Error('This smoke requires the prepared Windows Desktop runtime')
const desktop = join(repo, 'apps/desktop')
const root = await mkdtemp(join(repo, '.artifacts', 'desktop-file-devices-smoke-'))
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
await writeFile(join(application, 'smoke-entry.mjs'), `import { app } from 'electron'\nimport { writeFileSync } from 'node:fs'\nimport { join } from 'node:path'\napp.on('browser-window-created', (_event, window) => { window.webContents.setBackgroundThrottling(false); window.setTitle('DSH — Git 功能验证') })\napp.on('second-instance', () => { writeFileSync(join(process.env.DSH_SESSION_LINK_SMOKE_ROOT, 'second-instance.json'), JSON.stringify({ ownerPid: process.pid })) })\nawait import('./lib/main.js').catch(error => { console.error(error); app.exit(1) })\n`)
for (const name of Object.keys(manifest.dependencies)) {
  const destination = join(application, 'node_modules', name)
  await mkdir(dirname(destination), { recursive: true })
  await symlink(await realpath(join(desktop, 'node_modules', name)), destination, 'junction')
}
await writeFile(join(root,'ssh-config'),'Host gpu-fixture\n  HostName fixture.invalid\n  User fixture\n  Port 2222\n')
await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify([
  { id: 'code-review-controller', config: { provider:'review-fixture',model:'review' } },
  { id: 'subprocess', disabled: true },
  { insert: [{ id: 'fixture-subprocess', name: new URL('./fixtures/workflow-ssh-process.mjs', import.meta.url).href }] },
  { id: 'connection-controller', config: { sshExecutable:'fixture-ssh', sshConfigPath:join(root,'ssh-config'), controlRoot:join(root,'ssh-workspaces') } },
  { id: 'webserver', config: { host: '127.0.0.1', port: 0 } },
  { id: 'llm-deepseek', disabled: true }, { id: 'session-title-llm', disabled: true },
  { id: 'session-telemetry-otel', disabled: true },
  { id: 'agent-preset-registry', config: { default: 'standard' } },
  { insert: [{ id: 'session-link-smoke', name: new URL('./fixtures/workflow-host.mjs', import.meta.url).href }] },
]))
const env = { ...environment, DSH_SSH_TEST_NODE: process.execPath, DSH_HOME: join(root, 'home'), USERPROFILE: root, HOME: root,
  TEMP: root, TMP: root, TMPDIR: root, DSH_SESSION_LINK_SMOKE_ROOT: root,
  DSH_SESSION_LINK_SMOKE_IDS: JSON.stringify(sessionIds), DSH_DESKTOP_PRIMARY_RUNTIME_DIR: primaryRuntime,
  DSH_DESKTOP_PNPM_ENTRY: join(desktop, 'node_modules/pnpm/bin/pnpm.mjs'), DSH_DESKTOP_OPEN_DEVTOOLS: '0',
}
const args = [application, `--user-data-dir=${userData}`, '--lang=zh-CN']

env.DSH_SESSION_LINK_MENU_DEMO = '1'
env.DSH_FILE_QUOTE_SMOKE = '1'
await writeFile(join(root,'workspace','quote-fixture.md'),'# File fixture\n\nFile quotation with **bold** and $CNR < 1$.\n')
let electronApp, browser, gateway
try {
  electronApp = await _electron.launch({ executablePath: executable, args: [...args, 'dsh://session/' + encodeURIComponent(sessionIds[1])], cwd: root, env, timeout: 120_000 })
  electronApp.process().stderr.on('data',data=>appendFile(join(root,'host-stderr.log'),data))
  const deadline = Date.now() + 120_000
  let page
  while (Date.now() < deadline) {
    const windows = electronApp.windows()
    for (const candidate of windows) {
      if (candidate.url().endsWith('/welcome.html')) await candidate.evaluate(() => window.dshWelcome.skip()).catch(() => {})
    }
    page = windows.find(candidate => candidate.url() === 'dsh-app://app/')
    if (page && await page.locator('[data-conversation-session="' + sessionIds[1] + '"]').count()) break
    await new Promise(done => setTimeout(done, 250))
  }
  if (!page) throw new Error('Desktop demo did not reach its real application page')
  await page.locator('[data-conversation-session="' + sessionIds[1] + '"]').waitFor({ state: 'attached', timeout: 20000 })



  await electronApp.evaluate(({dialog}) => {
    globalThis.fixtureOriginalDialog = dialog.showMessageBox
    dialog.showMessageBox = async () => ({response:0,checkboxChecked:false})
  })
  const qrOpened = electronApp.waitForEvent('window')
  const invitationAction = page.evaluate(() => window.dshDesktop.devices.invoke('invitation'))
  const qr = await qrOpened
  await qr.getByAltText('一次性配对二维码').waitFor({timeout:20000})
  assert.ok(await qr.getByAltText('一次性配对二维码').evaluate(image => image.complete && image.naturalWidth > 0))
  await qr.close()
  await invitationAction
  await electronApp.evaluate(({dialog}) => { dialog.showMessageBox = globalThis.fixtureOriginalDialog; delete globalThis.fixtureOriginalDialog })
  await page.getByText('File quote fixture', {exact:true}).first().click()
  const preview = page.locator('[data-textpreview-body]')
  await preview.getByText('File quotation', {exact:false}).waitFor({timeout:30000})
  const quote = preview.locator('p').filter({hasText:'File quotation'}).first()
  await quote.evaluate(element => {
    const range = document.createRange();range.selectNodeContents(element)
    const selected = window.getSelection();selected.removeAllRanges();selected.addRange(range)
    element.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))
  })
  await page.getByRole('menuitem',{name:'添加注释',exact:true}).click()
  await page.getByRole('textbox',{name:'输入备注',exact:true}).fill('FILE_REMARK_FIXTURE')
  await page.getByRole('dialog').getByRole('button',{name:'添加到对话',exact:true}).click()
  await page.locator('[data-draft-annotations]').getByRole('button',{name:'1 条注释',exact:true}).waitFor()
  await page.screenshot({path:join(root,'file-annotation-draft.png')})
  const editor=page.locator('[contenteditable="true"]').last()
  await editor.fill('FILE_QUOTE_REQUEST');await editor.press('Enter')
  let received = ''
  const quoteDeadline = Date.now() + 30000
  while (Date.now() < quoteDeadline) {
    received = JSON.parse(await readFile(join(root,'last-model-input.json'),'utf8')).text
    if (received.includes('FILE_QUOTE_REQUEST')) break
    await new Promise(done=>setTimeout(done,100))
  }
  const envelope = JSON.parse(received.split('<dsh-response-annotations>\n').at(-1).split('\n</dsh-response-annotations>')[0])
  assert.equal(envelope.annotations[0].comment,'FILE_REMARK_FIXTURE')
  assert.ok(envelope.annotations[0].sourceLabel.endsWith('quote-fixture.md'))
  assert.equal(envelope.annotations[0].text,'File quotation with **bold** and $CNR < 1$.')
  const boot=await page.evaluate(()=>window.dshDesktopBoot.ready())
  const cookie=await electronApp.evaluate(async({session},url)=>(await session.defaultSession.cookies.get({url})).map(item=>`${item.name}=${item.value}`).join('; '),boot.streamBaseUrl)
  const {MobileServer,mobileAddresses}=await import('../src/mobile-server.ts')
  gateway=await MobileServer.create({path:join(root,'mobile-test-state'),seal:value=>Buffer.from(value),unseal:value=>value.toString(),host:()=>({url:boot.streamBaseUrl,cookie}),approve:async()=>true})
  await gateway.start(mobileAddresses()[0])
  await page.getByRole('button',{name:'设备与对话',exact:true}).click()
  await page.getByText('配对另一台电脑',{exact:true}).first().click()
  await page.getByRole('textbox',{name:'设备名称',exact:true}).fill('Fixture MacBook')
  await page.getByRole('textbox',{name:'一次性配对码',exact:true}).fill(gateway.pairingCode())
  await page.getByRole('button',{name:'配对另一台电脑',exact:true}).click()
  await page.getByRole('heading',{name:'Fixture MacBook · DSH 已连接',exact:true}).waitFor({timeout:45000})
  await page.screenshot({path:join(root,'paired-conversations.png')})
  const opened=electronApp.waitForEvent('window')
  await page.getByRole('button').filter({hasText:'协作 B · 接收与处理'}).click()
  const peer=await opened
  const continueButton=peer.getByRole('button',{name:'继续',exact:true})
  await continueButton.click({timeout:15000}).catch(()=>{})
  await peer.locator('[data-conversation-session="'+sessionIds[1]+'"]').waitFor({timeout:60000})
  assert.equal(await peer.evaluate(()=>typeof window.dshDesktop),'undefined')
  await peer.screenshot({path:join(root,'paired-remote-window.png')})
  const remoteEditor=peer.locator('[contenteditable="true"]').last()
  await remoteEditor.fill('REMOTE_DEVICE_REQUEST');await remoteEditor.press('Enter')
  await peer.getByText('REMOTE_DEVICE_REQUEST',{exact:true}).waitFor({timeout:20000})
  const remoteDeadline = Date.now() + 30000
  let remoteReceived = false
  while (Date.now() < remoteDeadline) {
    remoteReceived = (await readFile(join(root,'last-model-input.json'),'utf8')).includes('REMOTE_DEVICE_REQUEST')
    if (remoteReceived) break
    await new Promise(done=>setTimeout(done,100))
  }
  assert.ok(remoteReceived)
  gateway.revoke(gateway.devices[0].id)
  await page.getByRole('button',{name:'刷新',exact:true}).click()
  await page.getByRole('heading',{name:'Fixture MacBook · 未连接',exact:true}).waitFor({timeout:40000})
  const result={passed:true,root,fileQuoteToModel:true,pairedConversationList:true,remoteConversationOpened:true,remoteTaskSent:true,noLocalPreload:true,qrRendered:true,revocation:true,androidHardwareTested:false}
  await writeFile(join(repo,'.artifacts/file-devices-smoke-result.json'),JSON.stringify(result,null,2))
  console.log(JSON.stringify(result))
} finally {
  await gateway?.stop().catch(()=>{})
  await electronApp?.evaluate(({app})=>app.exit(0)).catch(()=>{})
  await electronApp?.close().catch(()=>{})
}
