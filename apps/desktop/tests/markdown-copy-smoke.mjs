/** Real Electron cold/second-instance link qualification with private local data and no protocol registration. */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, realpath, symlink, writeFile, appendFile, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const { _electron } = createRequire(new URL('../../web/package.json', import.meta.url))('playwright')

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const desktop = join(repo, 'apps/desktop')
const root = await mkdtemp(join(repo, '.artifacts', 'desktop-copy-links-smoke-'))
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
  { insert: [{ id: 'session-link-smoke', name: new URL('./fixtures/markdown-copy-host.mjs', import.meta.url).href }] },
]))
const env = { ...environment, DSH_HOME: join(root, 'home'), USERPROFILE: root, HOME: root,
  TEMP: root, TMP: root, TMPDIR: root, DSH_SESSION_LINK_SMOKE_ROOT: root,
  DSH_SESSION_LINK_SMOKE_IDS: JSON.stringify(sessionIds), DSH_DESKTOP_PRIMARY_RUNTIME_DIR: primaryRuntime,
  DSH_DESKTOP_PNPM_ENTRY: join(desktop, 'node_modules/pnpm/bin/pnpm.mjs'), DSH_DESKTOP_OPEN_DEVTOOLS: '0',
}
const args = [application, `--user-data-dir=${userData}`, '--lang=zh-CN']

env.DSH_SESSION_LINK_MENU_DEMO = '1'
let electronApp
try {
  electronApp = await _electron.launch({ executablePath: executable, args: [...args, 'dsh://session/' + encodeURIComponent(sessionIds[1])], cwd: root, env, timeout: 120_000 })
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

  await electronApp.evaluate(async ({clipboard,ClipboardItem})=>{
    globalThis.__clipboardBackup=await Promise.all((await clipboard.read()).map(async item=>new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type=>[type,await item.getType(type)]))))))
  })
  const quote=page.locator('[data-conversation-session="'+sessionIds[1]+'"] blockquote').last()
  await quote.waitFor({timeout:30000})
  await quote.scrollIntoViewIfNeeded()
  await quote.evaluate(element=>{
    const range=document.createRange();range.selectNodeContents(element)
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range)
  })
  await page.keyboard.press('Control+C')
  const expected=String.raw`对缺陷像素集合 $D$ 与背景环 $B$，取灰度均值 $\mu_D$、$\mu_B$ 与背景标准差 $\sigma_B$。原始公式 \begin{equation} c=\frac{\mu_D-\mu_B}{\sigma_{B}} \end{equation}，后文 111 保留。`
  const copied=await electronApp.evaluate(async({clipboard})=>({text:await clipboard.readText(),types:(await clipboard.read()).flatMap(item=>item.types)}))
  assert.equal(copied.text,expected)
  assert.ok(!copied.types.includes('text/html'),'Rich HTML must not override Markdown when pasted')
  const editor=page.locator('[contenteditable="true"]').last()
  await editor.click()
  await page.keyboard.press('Control+V')
  assert.equal(await editor.innerText(),expected,'Native paste keeps the Markdown/TeX source unchanged')
  await page.screenshot({path:join(root,'markdown-copy-paste.png')})
  const formula=page.locator('[data-copy-math-display="true"]').last()
  await formula.evaluate(element=>{
    const glyph=element.querySelector('.katex-html .mord')
    const range=document.createRange();range.selectNodeContents(glyph)
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range)
  })
  await page.keyboard.press('Control+C')
  const math=await electronApp.evaluate(async({clipboard})=>clipboard.readText())
  assert.ok(math.startsWith('$$\n'))
  assert.ok(math.includes(String.raw`\frac{\lvert \mu_D-\mu_B\rvert}{\mu_B}`))
  assert.ok(math.endsWith('\n$$'))
  assert.ok(!math.includes('μ'))
  const link=page.getByRole('button',{name:'HANDOFF_写作交接_20261008.md',exact:true}).last()
  await link.evaluate(element=>{const text=[...element.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);const range=document.createRange();range.selectNodeContents(text);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range)})
  await page.keyboard.press('Control+C')
  const copiedLink=await electronApp.evaluate(async({clipboard})=>clipboard.readText())
  assert.equal(copiedLink,'HANDOFF_写作交接_20261008.md')
  await page.evaluate(() => window.getSelection()?.removeAllRanges())
  await page.locator('[data-turn-tail]').last().getByRole('button',{name:'复制',exact:true}).click()
  const whole=await electronApp.evaluate(async({clipboard})=>({text:await clipboard.readText(),types:(await clipboard.read()).flatMap(item=>item.types)}))
  assert.ok(whole.text.includes('这是加粗内容，还有 斜体 和 删除线。'))
  assert.ok(!whole.text.includes('**') && !whole.text.includes('## ') && !whole.text.includes('~~'))
  assert.ok(!whole.text.includes('D:/Demo/'))
  assert.ok(whole.text.includes(String.raw`| 名称 | 值 |
| --- | --- |
| 均值 | $\mu_D$ |`))
  assert.ok(!whole.types.includes('text/html'))
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+V')
  assert.equal(await editor.innerText(),whole.text)
  await page.screenshot({path:join(root,'content-only-copy-paste.png')})
  const result={wholeMessageCopy:true,plainFormatting:true,tablesRetained:true,passed:true,root,nativeCopy:true,nativePaste:true,texSource:true,partialFormulaAtomic:true,linkLabelOnly:true}
  await writeFile(join(repo,'.artifacts/markdown-copy-native-result.json'),JSON.stringify(result,null,2))
  console.log(JSON.stringify(result,null,2))
} finally {
  const ownedProcess = electronApp?.process()
  await electronApp?.evaluate(async ({clipboard,app})=>{try{if(globalThis.__clipboardBackup && /(?:缺陷像素集合|\\mu_D|HANDOFF_写作交接_20261008)/.test(await clipboard.readText()))await clipboard.write(globalThis.__clipboardBackup)}finally{app.exit(0)}}).catch(()=>{})
  await electronApp?.close().catch(()=>{})
  if (ownedProcess?.exitCode === null && ownedProcess.pid !== undefined) {
    try { execFileSync('taskkill.exe', ['/PID', String(ownedProcess.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }) } catch {}
  }
}
