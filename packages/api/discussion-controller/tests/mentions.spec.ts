import { expect, it } from 'vitest'
import { mentionedAssistant } from '../src/mentions.ts'
import { assistantRecord } from '../src/spec.ts'

const assistant = assistantRecord.parse({ id: 'a-1', revision: 1, name: '研究助手', instructions: '',
  template: 'resident', memoryMode: 'off', provider: 'provider', model: 'reasoner', archived: false, createdAt: 1, updatedAt: 1 })
it('resolves an inline name or persisted reference chip to the same configured route', () => {
  expect(mentionedAssistant('请你 @研究助手 检查这里', [assistant])).toEqual(assistant)
  expect(mentionedAssistant('[@旧昵称](dsh-assistant:a-1) 检查这里', [assistant])).toEqual(assistant)
  expect(mentionedAssistant('hello@example.com', [assistant])).toBeUndefined()
})
it('does not route mentions in quoted text or code examples', () => {
  expect(mentionedAssistant('> @研究助手 检查\n```\n@研究助手\n```\n`@研究助手`', [assistant])).toBeUndefined()
  expect(mentionedAssistant('<dsh-response-annotations>\n{"text":"please @研究助手 check"}\n</dsh-response-annotations>\n\n解释引用', [assistant])).toBeUndefined()
})
it('refuses ambiguous names, multiple speakers, removed identities and missing models', () => {
  const other = { ...assistant, id: 'a-2' as typeof assistant.id }
  expect(() => mentionedAssistant('@研究助手 回答', [assistant, other])).toThrow('one')
  expect(() => mentionedAssistant('[@a](dsh-assistant:deleted)', [assistant])).toThrow('unavailable')
  expect(() => mentionedAssistant('@研究助手 回答', [{ ...assistant, archived: true }])).toThrow('unavailable')
  const { provider: _provider, model: _model, ...legacy } = assistant
  expect(() => mentionedAssistant('@研究助手 回答', [legacy])).toThrow('model')
})
it('validates bounded local avatars and leaves legacy profiles readable', () => {
  expect(() => assistantRecord.parse({ ...assistant, avatar: 'https://tracker.invalid/avatar.svg' })).toThrow()
  expect(() => assistantRecord.parse({ ...assistant, avatar: 'data:image/svg+xml;base64,PHN2Zz4=' })).toThrow()
  expect(assistantRecord.parse({ ...assistant, avatar: '🦉' }).avatar).toBe('🦉')
})
