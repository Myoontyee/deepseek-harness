/** Real Desktop message-edit regression: close the process, reopen the same log, edit again and reopen. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, realpath, symlink, writeFile, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const { _electron } = createRequire(new URL('../../web/package.json', import.meta.url))('playwright')

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const desktop = join(repo, 'apps/desktop')
const root = await mkdtemp(join(repo, '.artifacts', 'desktop-edit-restart-smoke-'))
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
await writeFile(join(application, 'smoke-entry.mjs'), `import { app } from 'electron'\nimport { writeFileSync } from 'node:fs'\nimport { join } from 'node:path'\napp.on('browser-window-created', (_event, window) => { window.webContents.setBackgroundThrottling(false); window.setTitle('DeepSeek Harness — 会话互通体验版') })\napp.on('second-instance', () => { writeFileSync(join(process.env.DSH_SESSION_LINK_SMOKE_ROOT, 'second-instance.json'), JSON.stringify({ ownerPid: process.pid })) })\nawait import('./lib/main.js').catch(error => { console.error(error); app.exit(1) })\n`)
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
  { insert: [{ id: 'session-link-smoke', name: new URL('./fixtures/edit-restart-host.mjs', import.meta.url).href }] },
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
  for (let phase = 0; phase < 3; phase++) {
    electronApp = await _electron.launch({ executablePath: executable,
      args: [...args, 'dsh://session/' + encodeURIComponent(sessionIds[1])], cwd: root,
      env: { ...env, DSH_EDIT_RESTART: phase === 0 ? '0' : '1' }, timeout: 120000 })
    ownedProcess = electronApp.process()
    console.log('Desktop phase', phase, 'PID', ownedProcess.pid)
    let page
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
      for (const window of electronApp.windows()) {
        if (window.url().endsWith('/welcome.html')) await window.evaluate(() => window.dshWelcome.skip()).catch(() => {})
      }
      page = electronApp.windows().find(window => window.url() === 'dsh-app://app/')
      if (page && await page.locator('[data-conversation-session="' + sessionIds[1] + '"]').count()) break
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    assert.ok(page, 'Real Desktop transcript must open')
    const transcript = page.locator('[data-conversation-session="' + sessionIds[1] + '"]')
    await page.getByRole('button', {name:'编辑消息',exact:true}).waitFor({timeout:30000})
    if (phase > 0) {
      await transcript.getByText('重启验证修改稿 ' + phase, {exact:true}).waitFor()
      assert.equal(await transcript.getByText('介绍一下这次会话互通演示', {exact:true}).count(), 0)
      assert.equal(await page.getByText('处理失败', {exact:true}).count(), 0)
    }
    if (phase < 2) {
      await page.getByRole('button', {name:'编辑消息',exact:true}).click()
      await page.getByLabel('编辑消息', {exact:true}).fill('重启验证修改稿 ' + (phase + 1))
      if (phase === 0) await page.getByLabel('编辑消息', {exact:true}).press('Control+Enter')
      else await page.getByRole('button', {name:'保存并重新生成',exact:true}).click()
      await page.getByLabel('编辑消息', {exact:true}).waitFor({state:'hidden',timeout:30000})
      await transcript.getByText('重启验证修改稿 ' + (phase + 1), {exact:true}).waitFor()
      await page.getByRole('button', {name:'编辑消息',exact:true}).waitFor({timeout:30000})
      const input = JSON.parse(await readFile(join(root,'last-model-input.json'),'utf8')).text
      assert.ok(input.includes('重启验证修改稿 ' + (phase + 1)))
      assert.ok(!input.includes('介绍一下这次会话互通演示'))
      if (phase === 1) assert.ok(!input.includes('重启验证修改稿 1'))
    }
    await page.screenshot({path:join(root,'phase-' + phase + '.png')})
    await close()
  }
  evidence.passed = true
  await writeFile(join(repo,'.artifacts/edit-restart-native-result.json'), JSON.stringify(evidence,null,2))
  console.log(JSON.stringify(evidence,null,2))
} finally {
  if (ownedProcess?.pid && ownedProcess.exitCode === null && ownedProcess.signalCode === null) {
    execFileSync('taskkill', ['/PID', String(ownedProcess.pid), '/T', '/F'], {windowsHide:true})
  }
  await electronApp?.close().catch(() => {})
}
