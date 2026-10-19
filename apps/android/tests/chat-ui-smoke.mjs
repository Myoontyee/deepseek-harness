import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
import { createRequire } from 'node:module'
const { chromium } = createRequire(new URL('../../web/package.json', import.meta.url))('playwright')
const assets = resolve('apps/android/app/src/main/assets/chat')
const server = createServer((req, res) => {
  const path = resolve(assets, '.' + new URL(req.url, 'http://localhost').pathname)
  if (!path.startsWith(assets + sep)) { res.writeHead(403).end(); return }
  try { const data = readFileSync(path); res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[extname(path)] ?? 'application/octet-stream'); res.end(data) }
  catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 1 })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.commands = []
    window.fixture = { type: 'state', generating: false, chats: [{ id: 'phone-one', title: '手机研究' }], models: [{ id: 'deepseek-fixture', name: 'DeepSeek fixture', available: true }], chat: { id: 'phone-one', title: '手机研究', draft: '未发送草稿', effort: 'high', annotations: [], messages: [{ role: 'user', text: '你好' }, { role: 'assistant', model: 'deepseek-fixture', text: '这里有 [链接](https://example.com/paper) 和公式 $CNR < 1$。\n\n| 项目 | 数量 |\n| --- | --- |\n| 样本 | 3 |\n\n<script>unsafe()</script>\n\nsk-abcdefghijklmnopqrstuvwxyz1234567890' }] } }
    window.phone = { postMessage(value) { const request = JSON.parse(value); window.commands.push(request); if (request.action === 'init') queueMicrotask(() => window.phone.onmessage({ data: JSON.stringify(window.fixture) })) } }
  })
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`)
  await page.getByText('DeepSeek fixture', { exact: true }).waitFor({ state: 'attached' })
  assert.equal(await page.locator('#input').inputValue(), '未发送草稿')
  assert.equal(await page.locator('.katex').count(), 1)
  assert.equal(await page.locator('main script').count(), 0)
  assert.equal(await page.getByRole('link', { name: '链接' }).getAttribute('href'), 'https://example.com/paper')
  assert.equal((await page.locator('main').textContent()).includes('abcdefghijklmnopqrstuvwxyz1234567890'), false)
  await page.evaluate(() => { const root = document.querySelector('article.assistant .markdown'), range = document.createRange(); range.selectNodeContents(root); getSelection().removeAllRanges(); getSelection().addRange(range) })
  await page.locator('#selection').click()
  await page.locator('#annotation').waitFor({ state: 'visible' })
  assert.ok((await page.locator('#quote').textContent()).includes('链接'))
  await page.locator('#comment').fill('很长的批注草稿，点击旁边也不能丢失')
  await page.keyboard.press('Escape')
  await page.locator('#notice').click()
  assert.equal(await page.locator('#comment').inputValue(), '很长的批注草稿，点击旁边也不能丢失')
  await page.keyboard.press('Control+Enter')
  const note = await page.evaluate(() => window.commands.findLast(item => item.action === 'annotation').note)
  assert.ok(note.quote.includes('[链接](<https://example.com/paper>)'), JSON.stringify(note))
  assert.ok(note.quote.includes('$CNR < 1$'))
  assert.ok(note.quote.includes('|'))
  assert.equal(note.comment, '很长的批注草稿，点击旁边也不能丢失')
  assert.equal(note.quote.includes('abcdefghijklmnopqrstuvwxyz1234567890'), false)
  await page.addScriptTag({ url: `http://127.0.0.1:${server.address().port}/native-selection.js` })
  const nativeAccepted = await page.evaluate(() => {
    const body = document.querySelector('article.assistant .markdown'), range = document.createRange()
    range.selectNodeContents(body); getSelection().removeAllRanges(); getSelection().addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    // Android may clear its active DOM selection while the native menu closes.
    getSelection().removeAllRanges()
    return window.dshNativeAnnotate()
  })
  assert.equal(nativeAccepted, true)
  await page.locator('#annotation').waitFor({ state: 'visible' })
  assert.ok((await page.locator('#quote').textContent()).includes('链接'))
  assert.equal((await page.locator('#quote').textContent()).includes('abcdefghijklmnopqrstuvwxyz1234567890'), false)
  await page.locator('#comment').fill('从原生长按菜单继续的备注')
  await page.keyboard.press('Control+Enter')
  assert.equal(await page.evaluate(() => window.commands.findLast(item => item.action === 'annotation').note.comment), '从原生长按菜单继续的备注')
  await page.locator('#effort').selectOption('max')
  await page.locator('#send').click()
  const sent = await page.evaluate(() => window.commands.findLast(item => item.action === 'send'))
  assert.equal(sent.model, 'deepseek-fixture'); assert.equal(sent.effort, 'max')
  await page.locator('#history').click()
  await page.evaluate(() => window.phone.onmessage({ data: JSON.stringify({ type: 'remote', device: 'computer-one', name: '3070-laptop', error: '', sessions: [{ id: 'remote-conversation', title: '电脑上的研究', running: true }] }) }))
  const remote = '#remoteChats [data-device="computer-one"]'
  assert.equal(await page.locator(`${remote} .remote-row svg`).count(), 1)
  assert.equal(await page.locator(`${remote} .remote-device .device-name`).textContent(), '3070-laptop')
  assert.equal(await page.locator(`${remote} .remote-device .device-state`).getAttribute('data-status'), 'online')
  assert.equal(await page.locator(`${remote} .remote-running`).textContent(), '运行中')
  await page.screenshot({ path: '.artifacts/android-drawer-remote.png' })
  // A failed refresh keeps the last conversation list and marks the device offline instead of a bare error line.
  await page.evaluate(() => window.phone.onmessage({ data: JSON.stringify({ type: 'remote', device: 'computer-one', name: '3070-laptop', error: '电脑离线，显示上次对话。', sessions: [{ id: 'remote-conversation', title: '电脑上的研究' }] }) }))
  assert.equal(await page.locator(`${remote} .remote-device .device-state`).getAttribute('data-status'), 'offline')
  assert.equal(await page.locator(`${remote} .remote-row`).count(), 1)
  assert.ok((await page.locator(`${remote} .remote-note`).textContent()).includes('电脑离线'))
  await page.screenshot({ path: '.artifacts/android-drawer-remote-offline.png' })
  await page.getByRole('button', { name: '电脑上的研究' }).click()
  const opened = await page.evaluate(() => window.commands.findLast(item => item.action === 'remoteOpen'))
  assert.deepEqual(opened, { action: 'remoteOpen', device: 'computer-one', id: 'remote-conversation' })
  assert.equal(await page.locator('#drawer').isVisible(), false)
  assert.equal(await page.evaluate(() => window.commands.some(item => ['pair', 'login', 'status'].includes(item.action))), false)
  await page.screenshot({ path: '.artifacts/android-phone-chat-ui.png' })
  // Geometry fixtures cover phone portrait, landscape, keyboard-height and tablet widths.
  await page.evaluate(() => {
    window.fixture.chat.id = 'long-layout-fixture'
    window.fixture.chat.title = '用于验证窄屏标题与远程会话布局的超长对话标题'.repeat(5)
    window.fixture.models[0].name = 'DeepSeek 长模型名称 '.repeat(12)
    window.fixture.chat.draft = '很长的输入草稿\n'.repeat(20)
    window.fixture.chat.annotations = [{ id: 'note', quote: '长引用'.repeat(500), comment: '批注'.repeat(500) }]
    window.fixture.chat.messages[1].text += '\n\n$$' + 'x_1 + '.repeat(50) + 'x_n$$\n\n```text\n' + 'long-code-'.repeat(100) + '\n```\n\n| ' + Array(12).fill('长表格列').join(' | ') + ' |\n| ' + Array(12).fill('---').join(' | ') + ' |\n| ' + Array(12).fill('数据').join(' | ') + ' |'
    window.phone.onmessage({ data: JSON.stringify(window.fixture) })
  })
  async function fits(selector) {
    const geometry = await page.locator(selector).evaluate(node => {
      const r = node.getBoundingClientRect()
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, vw: innerWidth, vh: visualViewport.height }
    })
    assert.ok(geometry.width > 0 && geometry.height > 0 && geometry.x >= -1 && geometry.y >= -1 && geometry.right <= geometry.vw + 1 && geometry.bottom <= geometry.vh + 1, `${selector}: ${JSON.stringify(geometry)}`)
  }
  for (const [width, height] of [[320, 640], [360, 740], [412, 900], [360, 360], [740, 360], [1024, 768]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(100)
    await fits('header'); await fits('footer'); await fits('#send'); await fits('#model'); await fits('#effort')
    assert.ok(await page.locator('#messages').evaluate(node => node.clientHeight >= 50 && node.scrollWidth <= node.clientWidth + 1), `chat overflow ${width}x${height}`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow ${width}x${height}`)
    await page.locator('#history').click(); await fits('#drawer'); await fits('#settings')
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#drawer').isVisible(), false)
    await page.evaluate(() => { const root = document.querySelector('article.assistant .markdown'), range = document.createRange(); range.selectNodeContents(root); getSelection().removeAllRanges(); getSelection().addRange(range) })
    await page.locator('#selection').click(); await fits('#annotation')
    await page.locator('#comment').fill('超长批注'.repeat(1000))
    await page.locator('#saveNote').scrollIntoViewIfNeeded(); await fits('#saveNote')
    await page.keyboard.press('Escape')
    await page.screenshot({ path: `.artifacts/android-layout-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 412, height: 900 })
  // Some WebViews shrink only the visual viewport for the keyboard.
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 360 })
    visualViewport.dispatchEvent(new Event('resize'))
  })
  await fits('#send'); await fits('footer')
  await page.evaluate(() => { const root = document.querySelector('article.assistant .markdown'), range = document.createRange(); range.selectNodeContents(root); getSelection().removeAllRanges(); getSelection().addRange(range) })
  await page.locator('#selection').click(); await fits('#annotation')
  await page.keyboard.press('Escape')
  await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')) })
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(50)
  assert.equal(await page.locator('body').getAttribute('data-ds-dark-theme'), '')
  await page.screenshot({ path: '.artifacts/android-phone-chat-dark.png' })
  // Older Desktop pages mount their existing menu asynchronously; opening it must not depend on frame timing.
  await page.evaluate(() => {
    const native = document.createElement('div'); native.id = 'remote-fixture'; native.textContent = '电脑文件的所选文字'; document.body.append(native)
    const range = document.createRange(); range.selectNodeContents(native); getSelection().removeAllRanges(); getSelection().addRange(range)
    document.dispatchEvent(new Event('selectionchange')); getSelection().removeAllRanges()
    window.remoteQuote = ''
    native.addEventListener('pointerup', () => {
      const captured = getSelection().toString()
      setTimeout(() => { const action = document.createElement('button'); action.role = 'menuitem'; action.textContent = '添加注释'; action.onclick = () => { window.remoteQuote = captured; action.remove() }; document.body.append(action) }, 80)
    })
    window.dshNativeAnnotate()
  })
  await page.waitForFunction(() => window.remoteQuote === '电脑文件的所选文字')
  assert.deepEqual(errors, [])
  console.log('Phone chat: model/effort, safe Markdown selection, draft shortcuts, desktop navigation, six responsive sizes, long content, keyboard-height viewport and dark theme passed.')
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
