// @vitest-environment jsdom
/** Assistant templates change real saved policies; failed saves retain user text. */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { DiscussionAssistant } from '@deepseek-ai/dsh-api-discussion-controller/types'
import { AssistantSettings, type AssistantSettingsActions } from '../src/client/AssistantSettings.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
async function fixture() {
  const profile: DiscussionAssistant = { id: 'a' as DiscussionAssistant['id'], revision: 1, name: 'Analyst', instructions: '',
    template: 'temporary', memoryMode: 'off', archived: false, createdAt: 1, updatedAt: 1 }
  const save = vi.fn<AssistantSettingsActions['saveAssistant']>(async (_current, draft) => ({ ...profile, ...draft }))
  const actions: AssistantSettingsActions = {
    listModels: async () => ({ default: { provider: 'test', model: 'reviewer' }, routableProviders: ['test'], failures: [],
      groups: [{ id: 'test', name: 'Test provider', models: [{ id: 'reviewer', name: 'Reviewer model' }] }] }),
    listAssistants: async () => [], saveAssistant: save, listMemories: async () => [],
    remember: vi.fn(), updateMemory: vi.fn(), forget: vi.fn(),
  }
  const view = render(<AssistantSettings {...actions} t={makeTranslate(en)} />)
  await view.findByRole('option', { name: 'Reviewer model' })
  fireEvent.change(view.getByLabelText(en.model), { target: { value: JSON.stringify(['test', 'reviewer']) } })
  return { save, view }
}
it('saves a project template with project-only memory and user responsibilities', async () => {
  const { view, save } = await fixture()
  fireEvent.change(view.getByLabelText(en.name), { target: { value: 'Paper reviewer' } })
  fireEvent.change(view.getByLabelText(en.template), { target: { value: 'project' } })
  fireEvent.change(view.getByLabelText(en.duties), { target: { value: 'Check citations before proposing changes' } })
  expect(view.getByLabelText(en.memoryPolicy)).toHaveProperty('value', 'project')
  fireEvent.click(view.getByRole('button', { name: en.save }))
  await waitFor(() => { expect(save).toHaveBeenCalledWith(undefined, {
    name: 'Paper reviewer', instructions: 'Check citations before proposing changes', template: 'project', memoryMode: 'project', provider: 'test', model: 'reviewer',
  }) })
})
it('allows a resident identity with memory explicitly turned off', async () => {
  const { view, save } = await fixture()
  fireEvent.change(view.getByLabelText(en.name), { target: { value: 'Resident' } })
  fireEvent.change(view.getByLabelText(en.template), { target: { value: 'resident' } })
  expect(view.getByLabelText(en.memoryPolicy)).toHaveProperty('value', 'assistant')
  fireEvent.change(view.getByLabelText(en.memoryPolicy), { target: { value: 'off' } })
  fireEvent.click(view.getByRole('button', { name: en.save }))
  await waitFor(() => { expect(save).toHaveBeenCalledWith(undefined, expect.objectContaining({ template: 'resident', memoryMode: 'off' })) })
})
it('retains a long responsibility draft when saving fails', async () => {
  const { view, save } = await fixture()
  save.mockRejectedValueOnce(new Error('Revision conflict'))
  const text = 'Important user requirements. '.repeat(100)
  fireEvent.change(view.getByLabelText(en.name), { target: { value: 'Analyst' } })
  fireEvent.change(view.getByLabelText(en.duties), { target: { value: text } })
  fireEvent.click(view.getByRole('button', { name: en.save }))
  expect((await view.findByRole('alert')).textContent).toContain('Revision conflict')
  expect(view.getByLabelText(en.duties)).toHaveProperty('value', text)
})

it('saves a real model route, chosen avatar and model visibility independently of memory', async () => {
  const { view, save } = await fixture()
  fireEvent.change(view.getByLabelText(en.name), { target: { value: 'Analyst' } })
  fireEvent.click(view.getByRole('button', { name: '🦉' }))
  fireEvent.click(view.getByLabelText(en.showModel))
  fireEvent.click(view.getByRole('button', { name: en.save }))
  await waitFor(() => { expect(save).toHaveBeenCalledWith(undefined, expect.objectContaining({
    provider: 'test', model: 'reviewer', avatar: '🦉', showModel: true, memoryMode: 'off',
  })) })
})
