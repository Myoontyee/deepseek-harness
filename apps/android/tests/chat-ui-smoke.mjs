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
  await page.locator('#effort').selectOption('max')
  await page.locator('#send').click()
  const sent = await page.evaluate(() => window.commands.findLast(item => item.action === 'send'))
  assert.equal(sent.model, 'deepseek-fixture'); assert.equal(sent.effort, 'max')
  await page.locator('#history').click()
  await page.evaluate(() => window.phone.onmessage({ data: JSON.stringify({ type: 'remote', device: 'computer-one', name: '3070-laptop', error: '', sessions: [{ id: 'remote-conversation', title: '电脑上的研究' }] }) }))
  assert.equal(await page.locator('.remote-row svg').count(), 1)
  await page.getByRole('button', { name: '电脑上的研究' }).click()
  const opened = await page.evaluate(() => window.commands.findLast(item => item.action === 'remoteOpen'))
  assert.deepEqual(opened, { action: 'remoteOpen', device: 'computer-one', id: 'remote-conversation' })
  await page.locator('#closeHistory').click()
  assert.equal(await page.evaluate(() => window.commands.some(item => ['pair', 'login', 'status'].includes(item.action))), false)
  await page.screenshot({ path: '.artifacts/android-phone-chat-ui.png' })
  assert.deepEqual(errors, [])
  console.log('Phone chat: independent entry, model/effort, Markdown/TeX/link selection, secret masking and annotation draft shortcuts passed.')
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
