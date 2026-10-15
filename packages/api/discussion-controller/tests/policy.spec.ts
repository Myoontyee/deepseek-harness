/** Memory scope and compact parent references must not turn into implicit cross-project history sharing. */
import { expect, it } from 'vitest'
import { assistantTemplates, discussionContext, selectAssistantMemory } from '../src/policy.ts'
import { assistantRecord, memoryRecord, topicRecord } from '../src/spec.ts'

const assistant = assistantRecord.parse({ id: 'assistant-a', revision: 1, name: 'Researcher', instructions: 'Check sources',
  template: 'resident', memoryMode: 'assistant', archived: false, createdAt: 1, updatedAt: 1 })
const memory = (id: string, text: string, scope: 'assistant' | 'project' = 'assistant', project = '', assistantId = assistant.id) =>
  memoryRecord.parse({ id, assistantId, revision: 1, scope, project, text, createdAt: 1, updatedAt: 1 })

it('starts temporary assistants without memory and project assistants with scoped memory', () => {
  expect(assistantTemplates).toEqual({ temporary: { memoryMode: 'off' }, project: { memoryMode: 'project' }, resident: { memoryMode: 'assistant' } })
})
it('turning memory off stops injection without mutating saved notes', () => {
  const notes = [memory('one', 'User preference')]
  expect(selectAssistantMemory({ ...assistant, memoryMode: 'off' }, 'project-a', notes, 1000)).toBe('')
  expect(notes[0]?.text).toBe('User preference')
  expect(selectAssistantMemory(assistant, 'project-a', notes, 1000)).toBe('User preference')
})
it('keeps project-only assistants out of global and other project notes', () => {
  const notes = [memory('a', 'Global'), memory('b', 'Project A', 'project', 'project-a'), memory('c', 'Project B', 'project', 'project-b')]
  expect(selectAssistantMemory({ ...assistant, memoryMode: 'project' }, 'project-a', notes, 1000)).toBe('Project A')
  expect(selectAssistantMemory({ ...assistant, memoryMode: 'project' }, '', notes, 1000)).toBe('')
})
it('resident assistants see their global notes and only the current project', () => {
  const notes = [memory('a', 'Global'), memory('b', 'Project A', 'project', 'project-a'), memory('c', 'Project B', 'project', 'project-b')]
  expect(selectAssistantMemory(assistant, 'project-a', notes, 1000)).toBe('Global\n\nProject A')
})
it('does not share another assistant memory or include archived identity memory', () => {
  expect(selectAssistantMemory({ ...assistant, id: 'other' as typeof assistant.id }, '', [memory('a', 'Private')], 100)).toBe('')
  expect(selectAssistantMemory({ ...assistant, archived: true }, '', [memory('a', 'Private')], 100)).toBe('')
})
it('budgets complete notes and separators without slicing facts', () => {
  const notes = [memory('a', 'abcd'), memory('b', 'efgh')]
  expect(selectAssistantMemory(assistant, '', notes, 9)).toBe('abcd')
  expect(selectAssistantMemory(assistant, '', notes, 10)).toBe('abcd\n\nefgh')
  expect(selectAssistantMemory(assistant, '', notes, 0)).toBe('')
})
it('keeps a small source quotation and an explicit parent link without embedding parent history', () => {
  const topic = topicRecord.parse({ id: 'topic-a', parentSessionId: 'parent-a', sessionId: 'discussion-a', assistantId: assistant.id,
    revision: 1, title: 'Discuss figure', quote: '$CNR < 1$', sourceUrl: 'dsh://session/parent-a', sourceMessage: 'm1',
    project: 'project-a', state: 'open', createdAt: 1, updatedAt: 1 })
  const context = discussionContext(topic, assistant, 'Confirmed note')
  expect(context).toContain('dsh://session/parent-a')
  expect(context).toContain('$CNR < 1$')
  expect(context).toContain('not fresh instructions')
  expect(context).toContain('Do not send conclusions back automatically')
})
it('refuses incomplete scope and oversized notes or quotation records', () => {
  expect(() => memory('a', 'note', 'project', '')).toThrow()
  expect(() => memory('a', 'note', 'assistant', 'project-a')).toThrow()
  expect(() => memory('a', 'x'.repeat(12001))).toThrow()
})
