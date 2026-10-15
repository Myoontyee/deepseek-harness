/** Upstream announcements compare the official base, not the DIY build suffix. */
import { expect, it } from 'vitest'
import { newerOfficialVersion } from '../src/official-update-check.ts'

it('compares upstream alpha versions independently of custom build dates', () => {
  expect(newerOfficialVersion([{ tag_name: 'dsh-v0.2.1-alpha.4', draft: false }], '0.2.1-alpha.3.20261015.11')).toBe('0.2.1-alpha.4')
  expect(newerOfficialVersion([{ tag_name: 'v0.2.1-alpha.3', draft: false }], '0.2.1-alpha.3.20261015.11')).toBeUndefined()
})
it('ignores drafts and unrelated tags and chooses the highest version', () => {
  expect(newerOfficialVersion([{ tag_name: 'v9.0.0', draft: true }, { tag_name: 'custom-updates', draft: false },
    { tag_name: 'v2.0.0', draft: false }, { tag_name: 'v1.1.0', draft: false }], '1.0.0')).toBe('2.0.0')
})
it('rejects malformed responses and invalid installed versions', () => {
  expect(() => newerOfficialVersion({}, '1.0.0')).toThrow()
  expect(() => newerOfficialVersion([], 'invalid')).toThrow()
})
