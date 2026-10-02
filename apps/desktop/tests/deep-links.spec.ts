import { describe, expect, it } from 'vitest'
import { parseDesktopLink } from '../src/deep-links.ts'

describe('desktop conversation links', () => {
  it('decodes a single conversation identity without treating it as a navigation URL', () => {
    expect(parseDesktopLink('dsh://session/session-123')).toEqual({ kind: 'session', sessionId: 'session-123' })
    expect(parseDesktopLink(`dsh://session/${encodeURIComponent('local id/with?#text')}`))
      .toEqual({ kind: 'session', sessionId: 'local id/with?#text' })
  })

  it.each(['dsh://open', 'dsh://open/'])('keeps the existing application activation link %s', (url) => {
    expect(parseDesktopLink(url)).toEqual({ kind: 'open' })
  })

  it.each([
    '', 'https://example.com/', 'file:///tmp/session', 'javascript:alert(1)',
    'dsh://session', 'dsh://session/', 'dsh://session/id/extra', 'dsh://session/id?target=x',
    'dsh://session/id#other', 'dsh://user@session/id', 'dsh://session:443/id',
    'dsh://session/%', 'dsh://session/%00', 'dsh://session/%0A', 'dsh://open/extra',
  ])('ignores malformed or unrelated external input %s', (url) => {
    expect(parseDesktopLink(url)).toBeUndefined()
  })
})
