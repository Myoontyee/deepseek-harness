/** The shipped composer preserves drafts across application shortcuts and native IME replacements. */
import { chromium, type Locator, type Page } from 'playwright'
import { expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot, writeComposerDraft } from './support.ts'

it('preserves the composer draft and menu for application Enter combinations', async () => {
  const scaffold = await launchWebScaffold({})
  const events: SessionEvent[] = []
  const off = scaffold.ctx.on('session/event', (_session, event) => { events.push(event) })
  try {
    const browser = await chromium.launch()
    let failurePage: Page | undefined
    try {
      const page = await newEnglishPage(browser)
      failurePage = page
      const tripwire = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl)
      await connectFreshWorkspace(page, scaffold.workspaceCwd, 'composer-shortcuts')
      const input = page.locator('[data-composer-input][contenteditable="true"]').first()
      for (const draft of ['unsent draft', '/']) {
        await writeComposerDraft(page, input, draft)
        const markup = await input.innerHTML()
        for (const chord of ['Alt+Enter', 'Meta+Alt+Enter', 'Control+Alt+Enter', 'Control+Meta+Enter', 'Meta+Shift+Enter', 'Control+Shift+Enter']) {
          await input.press(chord)
          expect(await input.innerHTML(), `${draft}: ${chord}`).toBe(markup)
        }
        await input.press('Escape')
      }
      await writeComposerDraft(page, input, 'first line')
      await input.press('Shift+Enter')
      await page.keyboard.type('second line')
      expect(await input.innerText()).toBe('first line\nsecond line')
      expect(events.filter(event => event.type === 'user/message')).toHaveLength(0)
      expect(tripwire.pageErrors).toEqual([])
      expect(tripwire.warnings).toEqual([])
    } catch (error) {
      if (failurePage !== undefined) await saveFailureShot(failurePage, 'web-e2e-composer-shortcuts')
      throw error
    } finally {
      await browser.close()
    }
  } finally {
    off()
    await scaffold.close()
  }
})

/** Select one plain text span using the document selection, including backward drags. */
async function selectDraftText(input: Locator, text: string, backward: boolean): Promise<{ start: number; end: number }> {
  const offsets = await input.evaluate((element, span) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let preceding = 0
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const value = node.textContent ?? ''
      const start = value.indexOf(span.text)
      if (start < 0) {
        preceding += value.length
        continue
      }
      const end = start + span.text.length
      const selection = window.getSelection()
      if (selection === null) throw new Error('the editor document has no selection')
      selection.setBaseAndExtent(node, span.backward ? end : start, node, span.backward ? start : end)
      return { start: preceding + start, end: preceding + end }
    }
    throw new Error(`the composer does not contain the selection text: ${span.text}`)
  }, { text, backward })
  await expect.poll(() => input.evaluate(() => window.getSelection()?.toString())).toBe(text)
  return offsets
}

/** Seed through the shipped paste path before testing the native replacement sequence. */
async function seedImeDraft(input: Locator, text: string): Promise<void> {
  await expect.poll(() => input.getAttribute('data-composer-composing')).toBeNull()
  await input.click()
  const previous = await input.textContent()
  await input.press('ControlOrMeta+a')
  await expect.poll(() => input.evaluate(() => window.getSelection()?.toString())).toBe(previous)
  await input.evaluate((element, value) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', value)
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }))
  }, text)
  await expect.poll(() => input.textContent()).toBe(text)
}

it('preserves surrounding text and undo history when a Windows IME retains the selected replacement range', async () => {
  const scaffold = await launchWebScaffold({})
  const events: SessionEvent[] = []
  const off = scaffold.ctx.on('session/event', (_session, event) => { events.push(event) })
  try {
    const browser = await chromium.launch()
    let failurePage: Page | undefined
    try {
      // Exercise the Windows client behavior even when the browser suite runs on Linux.
      const page = await browser.newPage({
        viewport: { width: 1680, height: 1000 }, locale: 'en-US', timezoneId: 'Asia/Shanghai',
        userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`,
      })
      failurePage = page
      const tripwire = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl)
      await connectFreshWorkspace(page, scaffold.workspaceCwd, 'composer-ime')
      const input = page.locator('[data-composer-input][contenteditable="true"]').first()
      const cdp = await page.context().newCDPSession(page)
      try {
        for (const sample of [
          { original: '现在我们具体来改，先探讨方案。111', selected: '先探讨方案。', committed: '啊', backward: false },
          { original: '现在我们具体来改，先探讨方案。111', selected: '先探讨方案。', committed: '啊', backward: true },
          { original: '现在我们具体来改，先探讨方案。111', selected: '来改', committed: '啊', backward: false },
          { original: '前🙂选择替换后缀🙂111', selected: '选择替换', committed: '你', backward: false },
        ]) {
          await seedImeDraft(input, sample.original)
          const range = await selectDraftText(input, sample.selected, sample.backward)
          // Sogou sends an empty compositionstart, then replaces using the original
          // native selection offsets. Plain CDP composition recomputes that range and
          // misses the regression, so replay the captured retained-range sequence.
          await input.dispatchEvent('compositionstart', { data: '' })
          const length = await input.evaluate(element => element.textContent?.length ?? 0)
          await cdp.send('Input.imeSetComposition', {
            text: 'a', selectionStart: 1, selectionEnd: 1,
            replacementStart: range.start, replacementEnd: Math.min(range.end, length),
          })
          await cdp.send('Input.insertText', { text: sample.committed })
          await expect.poll(() => input.getAttribute('data-composer-composing')).toBeNull()
          const expected = sample.original.replace(sample.selected, sample.committed)
          await expect.poll(() => input.textContent()).toBe(expected)
          await input.press('ControlOrMeta+z')
          await expect.poll(() => input.textContent()).toBe(sample.original)
          await input.press('ControlOrMeta+Shift+z')
          await expect.poll(() => input.textContent()).toBe(expected)
          // A second replacement in the committed draft must keep its surrounding text.
          await selectDraftText(input, sample.committed, sample.backward)
          await cdp.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 })
          await cdp.send('Input.insertText', { text: '你' })
          await expect.poll(() => input.getAttribute('data-composer-composing')).toBeNull()
          await expect.poll(() => input.textContent()).toBe(sample.original.replace(sample.selected, '你'))
        }
        const original = '前文选择替换后文111'
        await seedImeDraft(input, original)
        await selectDraftText(input, '选择替换', false)
        // Cancelling before a native edit must not leave the placeholder in the draft.
        await input.dispatchEvent('compositionstart', { data: '' })
        await input.dispatchEvent('compositionend', { data: '' })
        await expect.poll(() => input.textContent()).toBe(original)
        await selectDraftText(input, '选择替换', false)
        await cdp.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 })
        await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 })
        await expect.poll(async () => (await input.textContent())?.endsWith('后文111')).toBe(true)
        await expect.poll(async () => (await input.textContent())?.startsWith('前文')).toBe(true)
        expect(events.filter(event => event.type === 'user/message')).toHaveLength(0)
        expect(tripwire.pageErrors).toEqual([])
        expect(tripwire.warnings).toEqual([])
      } finally {
        await cdp.detach()
      }
    } catch (error) {
      if (failurePage !== undefined) await saveFailureShot(failurePage, 'web-e2e-composer-ime')
      throw error
    } finally {
      await browser.close()
    }
  } finally {
    off()
    await scaffold.close()
  }
})
