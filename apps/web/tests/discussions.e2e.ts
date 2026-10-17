/** Real Web composition after saved assistants and sidebar discussions are retired. */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import type {} from '@deepseek-ai/dsh-api-discussion-controller'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { assistantRecord, discussionDomainSpec, memoryRecord, topicRecord } from '../../../packages/api/discussion-controller/src/spec.ts'
import { launchWebScaffold, seedSession, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, openSettings, saveFailureShot } from './support.ts'

const fixture = fileURLToPath(new URL('../../../snapshots/web/plan-narrow-viewport/session.v3.jsonl', import.meta.url))
const history = fileURLToPath(new URL('../../../snapshots/web/fresh-round-trip/session.v4.jsonl', import.meta.url))

it('removes assistant and discussion controls while preserving history and ordinary model selection', async () => {
  const resources: { scaffold?: WebScaffold; browser?: Browser; page?: Page } = {}
  let completed = false
  onTestFinished(async () => {
    try {
      if (resources.page && !completed) {
        await saveFailureShot(resources.page, 'web-e2e-discussion-retirement')
        await writeFile('.artifacts/web-e2e-discussion-retirement.txt', await resources.page.locator('body').innerText())
      }
    } finally { try { await resources.browser?.close() } finally { await resources.scaffold?.close() } }
  })
  const scaffold = await launchWebScaffold({ replayFixture: fixture, replayProvidersOnly: true })
  resources.scaffold = scaffold
  await seedSession(scaffold, await readFile(history, 'utf8'), 'discussion-e2e-parent', 'standard')
  await seedSession(scaffold, await readFile(history, 'utf8'), 'discussion-e2e-history', 'standard')
  const initial = await scaffold.ctx.sessionController.inspect('discussion-e2e-parent' as Parameters<typeof scaffold.ctx.sessionController.inspect>[0])
  const initialHeader = initial.events.findLast(event => event.type === 'request/header')
  if (initialHeader?.type !== 'request/header') throw new Error('Fixture model is missing')
  // Seed pre-upgrade records through the already-open archive; the public API is read-only.
  const domain = Reflect.get(scaffold.ctx.discussionController, 'domain') as Domain<typeof discussionDomainSpec>
  const assistant = assistantRecord.parse({ id: 'retired-helper', revision: 1, name: 'Retired helper fixture', instructions: 'OLD DUTIES',
    template: 'resident', memoryMode: 'assistant', provider: 'removed-provider', model: 'removed-model',
    reasoningEffort: 'max', avatar: '🦉', archived: false, createdAt: 1, updatedAt: 1 })
  const memory = memoryRecord.parse({ id: 'retained-note', assistantId: assistant.id, revision: 1, scope: 'assistant',
    project: '', text: 'RETIRED MEMORY MUST NOT BE INJECTED', createdAt: 1, updatedAt: 1 })
  const topic = topicRecord.parse({ id: 'retained-topic', parentSessionId: 'discussion-e2e-parent',
    sessionId: 'discussion-e2e-history', assistantId: assistant.id, revision: 1, title: 'Retained discussion',
    quote: '$CNR < 1$', sourceUrl: '', sourceMessage: '', project: '', state: 'open', createdAt: 1, updatedAt: 1 })
  await domain.table('assistants').put(assistant.id, assistant)
  await domain.table('memories').put(memory.id, memory)
  await domain.table('topics').put(topic.id, topic)
  const channel = process.env.DSH_TEST_BROWSER_CHANNEL
  const browser = await chromium.launch(channel ? { channel } : {})
  resources.browser = browser
  const page = await newEnglishPage(browser)
  resources.page = page
  await page.goto(scaffold.authenticatedUrl)
  const ungrouped = page.getByRole('treeitem', { name: /^Ungrouped/ })
  if (await ungrouped.getAttribute('aria-expanded') !== 'true') await ungrouped.click()
  await page.locator('[role="treeitem"]').last().click()
  await openSettings(page, 'en')
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  expect(await settings.getByRole('button', { name: 'Saved assistants', exact: true }).count()).toBe(0)
  await page.keyboard.press('Escape')
  await settings.waitFor({ state: 'detached' })
  expect(await page.getByRole('button', { name: 'Discussions', exact: true }).count()).toBe(0)
  const passage = page.getByText('DONE', { exact: true }).first()
  await passage.evaluate((element) => {
    const range = document.createRange(); range.selectNodeContents(element)
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
  })
  await passage.dispatchEvent('pointerup')
  await page.getByRole('menuitem', { name: 'Add annotation', exact: true }).waitFor()
  expect(await page.getByRole('menuitem', { name: 'Discuss in sidebar', exact: true }).count()).toBe(0)
  await page.keyboard.press('Escape')
  const requests: GenerateOptions[] = []
  scaffold.ctx.on('llm/stream', async function* (request) {
    requests.push(request)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'Ordinary conversation after retirement.' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Ordinary conversation after retirement.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }, { prepend: true })
  const main = page.locator('[data-conversation-session]').filter({ has: page.locator('[contenteditable="true"]') }).first()
  await main.locator('[contenteditable="true"]').first().fill('@Retired helper fixture answer this as ordinary text.')
  await main.getByRole('button', { name: 'Send message', exact: true }).click()
  await main.getByText('Ordinary conversation after retirement.', { exact: true }).waitFor()
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ provider: initialHeader.data.header.config.provider, model: initialHeader.data.header.config.model })
  expect(JSON.stringify(requests[0]?.messages)).not.toContain(memory.text)
  expect(JSON.stringify(requests[0]?.messages)).not.toContain('OLD DUTIES')
  expect(scaffold.ctx.discussionController.assistants()).toContainEqual(assistant)
  expect(scaffold.ctx.discussionController.memories(assistant.id)).toContainEqual(memory)
  expect(scaffold.ctx.discussionController.topics(topic.parentSessionId)).toContainEqual(topic)
  expect(scaffold.ctx.discussionController).not.toHaveProperty('createAssistant')
  expect(scaffold.ctx.discussionController).not.toHaveProperty('createTopic')
  await page.reload()
  await page.getByText('Ordinary conversation after retirement.', { exact: true }).waitFor()
  await page.screenshot({ path: '.artifacts/discussion-retirement.png' })
  completed = true
}, 120_000)
