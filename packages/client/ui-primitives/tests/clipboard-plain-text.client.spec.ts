// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { clipboardPlainText, markdownClipboardText } from '../src/markdown/clipboard-text.ts'

it('linearizes math once and strips ordinary presentation', () => {
  expect(clipboardPlainText('**mean** $\\mu_D$ and $\\frac{a}{b}$')).toBe('mean μ_D and (a)/(b)')
})
it('pastes tables as tab separated values', () => {
  expect(clipboardPlainText('| **Name** | Value |\n| --- | --- |\n| [x](https://example.com) | $x^2$ |')).toBe('Name\tValue\nx\tx^(2)')
})
it('leaves ordinary paste projection unchanged', () => {
  expect(markdownClipboardText('**mean** $\\mu_D$')).toBe('mean $\\mu_D$')
})
it('retains unknown formula content instead of losing it', () => {
  expect(clipboardPlainText('$\\unknowncommand{a}$')).toBe('\\unknowncommand{a}')
})
