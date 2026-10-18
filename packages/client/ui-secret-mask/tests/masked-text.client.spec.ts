import { expect, it } from 'vitest'
import { createCredentialTextMask } from '../src/client/masked-text.ts'

it('masks credentials before Markdown display without changing ordinary text and links', () => {
  const mask = createCredentialTextMask(), key = 'sk-abcdefghijklmnopqrstuvwxyz1234567890'
  expect(mask('Ordinary $x$ [paper](https://example.com)')).toBe('Ordinary $x$ [paper](https://example.com)')
  expect(mask(`Before ${key} after ${key}`)).not.toContain(key)
  expect(mask(key)).toContain('*')
  expect(mask('different text')).toBe('different text')
})
