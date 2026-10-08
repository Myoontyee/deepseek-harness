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
const root = await mkdtemp(join(repo, '.artifacts', 'desktop-workflows-smoke-'))
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



  const boot=await page.evaluate(()=>window.dshDesktopBoot.ready())
  const cookie=await electronApp.evaluate(async({session},url)=>(await session.defaultSession.cookies.get({url})).map(item=>`${item.name}=${item.value}`).join('; '),boot.streamBaseUrl)
  assert.ok(cookie,'The isolated Host has authenticated Electron browser cookies')
  const {MobileServer}=await import('../src/mobile-server.ts')
  gateway=await MobileServer.create({path:join(root,'mobile-test-state'),seal:value=>Buffer.from(value),unseal:value=>value.toString(),host:()=>({url:boot.streamBaseUrl,cookie}),approve:async()=>true})
  await gateway.start('127.0.0.1')
  const payload=JSON.parse(Buffer.from(gateway.pairingCode().slice(12),'base64url').toString())
  const https=await import('node:https')
  const deviceToken=await new Promise((resolve,reject)=>{
    const request=https.request(gateway.origin+'/_dsh_mobile/pair',{method:'POST',ca:gateway.state.cert,checkServerIdentity:()=>undefined,headers:{'content-type':'application/json'}},response=>{
      let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>{try{assert.equal(response.statusCode,200);resolve(JSON.parse(body).token)}catch(error){reject(error)}})
    });request.once('error',reject);request.end(JSON.stringify({code:payload.code,label:'Mobile browser fixture'}))
  })
  browser=await chromium.launch({headless:true,channel:process.env.DSH_MOBILE_TEST_BROWSER ?? 'msedge'})
  const context=await browser.newContext({ignoreHTTPSErrors:true,locale:'zh-CN',viewport:{width:1200,height:850}})
  await context.addCookies([{name:'__Host-dsh-device',value:deviceToken,url:gateway.origin,secure:true,httpOnly:true,sameSite:'Strict'}])
  const mobile=await context.newPage()
  mobile.on('pageerror',error=>console.error('PHONE_PAGE',error.message))
  await mobile.goto(gateway.origin,{waitUntil:'domcontentloaded'})
  await mobile.getByRole('button',{name:'继续',exact:true}).click({timeout:15000})
  await mobile.getByText('未分组',{exact:true}).click()
  await mobile.getByText('协作 B · 接收与处理',{exact:true}).first().click({timeout:60000})
  await mobile.locator('[data-conversation-session="'+sessionIds[1]+'"]').waitFor({timeout:30000})
  await mobile.setViewportSize({width:390,height:844})
  const editor=mobile.locator('[contenteditable="true"]').last()
  await editor.fill('来自手机的联调任务：请返回处理结果')
  await editor.press('Enter')
  await mobile.getByText('来自手机的联调任务：请返回处理结果',{exact:true}).waitFor({timeout:30000})
  await mobile.getByText('这是会话互通体验版（本地固定回复）。',{exact:true}).nth(1).waitFor({timeout:30000})
  await mobile.screenshot({path:join(root,'mobile-conversation.png'),fullPage:true})
  const text=await mobile.locator('body').innerText()
  assert.ok(text.includes('来自手机的联调任务'))
  gateway.revoke(gateway.devices[0].id)
  const status=await context.request.get(gateway.origin+'/_dsh_mobile/status')
  assert.equal(status.status(),401)
  const result={passed:true,root,pairedRealHost:true,realConversationVisible:true,mobilePromptSent:true,computerReplyReceived:true,revocation:true,androidHardwareTested:false}
  await writeFile(join(repo,'.artifacts/mobile-desktop-smoke-result.json'),JSON.stringify(result,null,2))
  console.log(JSON.stringify(result,null,2))
} catch(error) {
  console.error(error)
  if(browser){for(const context of browser.contexts())for(const page of context.pages()){console.log((await page.locator('body').innerText()).slice(0,4000));await page.screenshot({path:join(root,'mobile-failure.png')})}}
  throw error
} finally {
  await browser?.close().catch(()=>{})
  await gateway?.stop().catch(()=>{})
  await electronApp?.evaluate(({app})=>app.exit(0)).catch(()=>{})
  await electronApp?.close().catch(()=>{})
}
