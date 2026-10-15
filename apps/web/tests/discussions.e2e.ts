/** Real Web composition for saved assistants and a parent-scoped sidebar topic, without remote model calls. */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import type {} from '@deepseek-ai/dsh-api-discussion-controller'
import { launchWebScaffold, seedSession, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, openSettings, saveFailureShot } from './support.ts'

const fixture = fileURLToPath(new URL('../../../snapshots/web/plan-narrow-viewport/session.v3.jsonl', import.meta.url))
const history = fileURLToPath(new URL('../../../snapshots/web/fresh-round-trip/session.v4.jsonl', import.meta.url))

it('creates a saved assistant and a persistent topic beside the main conversation', async () => {
  const resources: { scaffold?: WebScaffold; browser?: Browser; page?: Page } = {}
  let completed = false
  onTestFinished(async () => {
    try {
      if (resources.page && !completed) {
        await saveFailureShot(resources.page, 'web-e2e-discussions')
        await writeFile('.artifacts/web-e2e-discussions.txt', await resources.page.locator('body').innerText())
      }
    } finally { try { await resources.browser?.close() } finally { await resources.scaffold?.close() } }
  })
  const scaffold = await launchWebScaffold({ replayFixture: fixture, replayProvidersOnly: true })
  resources.scaffold = scaffold
  await seedSession(scaffold, await readFile(history, 'utf8'), 'discussion-e2e-parent', 'standard')
  let modelSteps = 0
  scaffold.ctx.on('session/event', (_session, event) => { if (event.type === 'step/start') modelSteps++ })
  const channel = process.env.DSH_TEST_BROWSER_CHANNEL
  const browser = await chromium.launch(channel ? { channel } : {})
  resources.browser = browser
  const page = await newEnglishPage(browser)
  resources.page = page
  await page.goto(scaffold.authenticatedUrl)
  const ungrouped = page.getByRole('treeitem', { name: /^Ungrouped/ })
  if (await ungrouped.getAttribute('aria-expanded') !== 'true') await ungrouped.click()
  await page.locator('[role="treeitem"]').last().click()
  await page.locator('[data-conversation-session="discussion-e2e-parent"]').first().waitFor()
  await openSettings(page, 'en')
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await settings.getByRole('button', { name: 'Saved assistants', exact: true }).click()
  await settings.getByLabel('Assistant name', { exact: true }).fill('Review partner')
  await settings.getByLabel('Template').selectOption('project')
  await settings.getByLabel('Responsibilities and preferences', { exact: true }).fill('Discuss the selected passage and check its claims.')
  await settings.getByRole('button', { name: 'Save', exact: true }).click()
  await settings.getByRole('button', { name: 'Review partner', exact: true }).waitFor()
  await settings.getByLabel('Applies to').selectOption('project')
  await settings.getByLabel('Absolute project path', { exact: true }).fill(scaffold.workspaceCwd)
  await settings.getByLabel('Write explicit, verifiable preferences or facts', { exact: true }).fill('Use SI units.')
  await settings.getByRole('button', { name: 'Save memory', exact: true }).click()
  await settings.locator('article').filter({ hasText: 'Use SI units.' }).waitFor()
  await page.screenshot({ path: '.artifacts/discussions-settings.png' })
  await settings.getByRole('button', { name: 'Close', exact: true }).last().click()
  const passage = page.getByText('DONE', { exact: true })
  await passage.evaluate((element) => {
    const range = document.createRange(); range.selectNodeContents(element)
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
  })
  await passage.dispatchEvent('pointerup')
  await page.getByRole('menuitem', { name: 'Discuss in sidebar', exact: true }).click()
  await page.getByLabel('Topic title', { exact: true }).fill('Check this result')
  await page.getByRole('button', { name: 'New discussion', exact: true }).click()
  await page.getByRole('button', { name: 'Back to topics', exact: true }).waitFor()
  const topics = scaffold.ctx.discussionController.topics('discussion-e2e-parent' as Parameters<typeof scaffold.ctx.discussionController.topics>[0])
  const topic = topics[0]
  if (!topic) throw new Error('Topic was not persisted')
  const agent = scaffold.ctx.agents.get(topic.sessionId)
  if (!agent) throw new Error('Topic Agent is unavailable')
  const assembly = await scaffold.ctx.systemPrompt.assemble({ agent, scope: agent })
  const context = assembly.contexts.find(value => value.name === 'discussion-assistant')
  expect(context?.text).toContain('Use SI units.')
  expect(context?.text).toContain('"text":"DONE"')
  expect(context?.text).toContain('Discuss the selected passage and check its claims.')
  expect(context?.interpolate).toBe(false)
  const profile = scaffold.ctx.discussionController.assistants()[0]
  if (!profile) throw new Error('Assistant was not persisted')
  await scaffold.ctx.discussionController.updateAssistant(profile.id, profile.revision, { ...profile, memoryMode: 'off' })
  const disabled = await scaffold.ctx.systemPrompt.assemble({ agent, scope: agent })
  expect(disabled.contexts.find(value => value.name === 'discussion-assistant')?.text).not.toContain('Use SI units.')
  expect(scaffold.ctx.discussionController.memories(profile.id)).toHaveLength(1)
  await page.getByLabel('Write the conclusion to return to the parent', { exact: true }).fill('We should verify the source.')
  await page.getByRole('button', { name: 'Add to parent draft', exact: true }).click()
  await page.getByText('Added to the parent draft, not sent.', { exact: true }).waitFor()
  expect(await page.locator('[data-conversation-region="chat"]').count()).toBeGreaterThanOrEqual(2)
  await page.getByRole('button', { name: 'Back to topics', exact: true }).click()
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await page.getByText('Archived', { exact: true }).waitFor()
  await page.reload()
  await page.getByRole('button', { name: 'Discussions', exact: true }).first().click()
  await page.getByRole('button', { name: 'Check this result', exact: true }).waitFor()
  await page.getByText('Archived', { exact: true }).waitFor()
  await page.screenshot({ path: '.artifacts/discussions-board.png' })
  await page.getByRole('button', { name: 'Check this result', exact: true }).click()
  expect(await page.locator('[data-discussion-source]').textContent()).toContain('DONE')
  expect(modelSteps).toBe(0)
  completed = true
}, 120_000)
