/** Windows Desktop composition: review, visual Git, persisted SSH settings and interactive remote terminals. */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, realpath, symlink, writeFile, appendFile, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const { _electron } = createRequire(new URL('../../web/package.json', import.meta.url))('playwright')

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
let electronApp
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


  page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER',msg.text())})
  page.on('websocket',socket=>socket.on('framereceived',event=>{const text=String(event.payload);if(text.includes('settings/rejected')||text.includes('settings/conflict'))console.log('SETTINGS_RPC',text)}))
  page.on('pageerror', error => console.log('PAGEERROR', error.message))
  await page.getByText('更多', {exact:true}).click()
  await page.getByText('设置', {exact:true}).last().click()
  await page.getByText('代码审查', {exact:true}).last().click()
  await page.getByRole('button',{name:'开始审查',exact:true}).waitFor({timeout:30000})
  await page.getByRole('textbox',{name:'重点检查的问题（可选）',exact:true}).fill('请检查边界条件')
  await page.screenshot({path:join(root,'review-settings.png')})
  await page.getByRole('button',{name:'开始审查',exact:true}).click()
  await page.getByText('测试审查结果：已收到改动内容。本地固定回复，仅验证流程，不代表真实代码审查。',{exact:true}).waitFor({timeout:60000})
  const input=JSON.parse(await readFile(join(root,'review-model-input.json'),'utf8'))
  assert.ok(input.allText.includes('+after'))
  assert.ok(input.prompt.includes('请检查边界条件'))
  assert.ok(input.tools.includes('read'),'reviewer can inspect source')
  for(const forbidden of ['write','edit','bash','pwsh','send_session_message','subagent'])assert.ok(!input.tools.includes(forbidden),'reviewer excludes '+forbidden)
  assert.deepEqual(input.defaultAfter,input.defaultBefore,'review selection leaves default chat model intact')
  const persistedPath=join(root,'review-persistence.json')
  const persistedDeadline=Date.now()+30000
  while(Date.now()<persistedDeadline) { try { await access(persistedPath); break } catch { await new Promise(resolve=>setTimeout(resolve,100)) } }
  const persisted=JSON.parse(await readFile(persistedPath,'utf8'))
  assert.equal(persisted.preset,'code-review')
  assert.equal(persisted.hasPrompt,true)
  assert.equal(persisted.hasReply,true)
  await page.screenshot({path:join(root,'review-result.png')})
  await page.getByText('更多',{exact:true}).click()
  await page.getByText('设置',{exact:true}).last().click()
  await page.getByText('Git', {exact:true}).last().click()
  await page.locator('.dsh-git-settings').waitFor({timeout:30000})
  await page.getByRole('checkbox',{name:'选择文件 git-demo.txt',exact:true}).waitFor({timeout:60000})
  const cwd = await page.locator('.dsh-git-settings .path').innerText()
  const git = (...args) => execFileSync('git',args,{cwd,encoding:'utf8'}).trim()
  await page.getByRole('checkbox',{name:'选择文件 git-demo.txt',exact:true}).check()
  await page.getByRole('button',{name:'暂存所选文件',exact:true}).click()
  await page.waitForFunction(() => !document.querySelector('.dsh-git-settings fieldset')?.disabled, null, {timeout:30000})
  assert.equal(git('diff','--cached','--name-only'),'git-demo.txt')
  await page.getByRole('textbox',{name:'提交说明',exact:true}).fill('Desktop visual Git commit')
  await page.getByRole('button',{name:'提交已暂存更改',exact:true}).click()
  await page.waitForFunction(() => !document.querySelector('.dsh-git-settings fieldset')?.disabled, null, {timeout:30000})
  assert.equal(git('log','-1','--format=%s'),'Desktop visual Git commit')
  assert.equal(git('status','--porcelain'),'')
  await page.getByRole('textbox',{name:'新分支名称前缀',exact:true}).fill('custom/')
  await page.getByRole('button',{name:'保存',exact:true}).click()
  await page.getByRole('textbox',{name:'分支名称',exact:true}).fill('demo')
  await page.getByRole('button',{name:'新建分支',exact:true}).click()
  await page.waitForFunction(() => !document.querySelector('.dsh-git-settings fieldset')?.disabled, null, {timeout:30000})
  assert.equal(git('branch','--show-current'),'custom/demo')
  await page.screenshot({path:join(root,'git-settings-light.png')})
  await page.emulateMedia({colorScheme:'dark'})
  await page.screenshot({path:join(root,'git-settings-dark.png')})
  await page.emulateMedia({colorScheme:'light'})
  await page.getByText('连接',{exact:true}).last().click()
  await page.getByRole('button',{name:'测试连接',exact:true}).waitFor({timeout:30000})
  await page.getByRole('button',{name:'测试连接',exact:true}).click()
  await page.getByRole('status').filter({hasText:'上次连接测试通过'}).waitFor({timeout:30000})
  await page.getByRole('textbox',{name:'显示名称',exact:true}).fill('GPU 测试连接')
  await page.getByRole('textbox',{name:'远程目录',exact:true}).fill('/work/demo folder')
  await page.getByRole('checkbox',{name:'允许 AI 按此 SSH 账号的权限执行远程命令',exact:true}).check()
  await page.getByRole('button',{name:'保存连接',exact:true}).click()
  await page.getByRole('status').filter({hasText:'连接已保存'}).waitFor({timeout:20000})
  await page.screenshot({path:join(root,'connections-settings.png')})
  await page.getByRole('button',{name:'打开远程终端',exact:true}).click()
  await page.locator('.xterm-screen').waitFor({timeout:45000})
  await page.waitForFunction(()=>document.querySelector('.xterm-screen')?.textContent?.includes('DSH_REMOTE_TERMINAL_READY'),null,{timeout:15000})
  const terminalInput=page.locator('.xterm-helper-textarea')
  await terminalInput.focus()
  await terminalInput.pressSequentially('dsh-input-probe')
  await terminalInput.press('Enter')
  const inputDeadline=Date.now()+15000
  while(Date.now()<inputDeadline){try{assert.equal((await readFile(join(root,'ssh-input.txt'),'utf8')).trim(),'dsh-input-probe');break}catch{await new Promise(resolve=>setTimeout(resolve,100))}}
  assert.equal((await readFile(join(root,'ssh-input.txt'),'utf8')).trim(),'dsh-input-probe')
  await page.waitForFunction(()=>document.querySelector('.xterm-screen')?.textContent?.includes('REMOTE:dsh-input-probe'),null,{timeout:15000})
  const terminal=JSON.parse(await readFile(join(root,'ssh-terminal.json'),'utf8'))
  assert.ok(terminal.includes('HostName=fixture.invalid'))
  assert.ok(terminal.includes('StrictHostKeyChecking=yes'))
  assert.ok(terminal.at(-1).includes('/work/demo folder'))
  await page.screenshot({path:join(root,'connections-terminal.png')})
  const bound=await page.evaluate(async()=>{const response=await fetch('/workflow-smoke/ssh');if(!response.ok)throw new Error(await response.text());return response.json()})
  assert.equal(bound.readOnlyDenied,true)
  assert.equal(bound.revokedDenied,true)
  assert.deepEqual(bound.tools,['ssh_exec'])
  assert.equal(bound.output.stdout.trim(),'REMOTE_FIXTURE_RESULT')
  const result={passed:true,root,reviewContext:true,reviewReadOnlyTools:input.tools,realGitCommit:true,realGitBranch:true,readOnlyDenied:true,revokedDenied:true,connectionTest:true,savedProfile:true,remoteTerminal:true,terminalInputAndOutput:true,pinnedAgentCommand:true,tools:bound.tools}
  await writeFile(join(repo,'.artifacts/workflows-desktop-smoke-result.json'),JSON.stringify(result,null,2))
  console.log(JSON.stringify(result,null,2))
} catch(error) {
  console.error(error)
  if (electronApp) {
    for (const page of electronApp.windows()) {
      if(page.url()==='dsh-app://app/') { console.log((await page.locator('body').innerText()).slice(-7000)); await page.screenshot({path:join(root,'failure.png')}) }
    }
  }
  console.log('SMOKE_ROOT',root)
  throw error
} finally {
  await electronApp?.evaluate(({app})=>app.exit(0)).catch(()=>{})
  await electronApp?.close().catch(()=>{})
}
