// @vitest-environment jsdom
/** Assistant templates change real saved policies; failed saves retain user text. */
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useSyncExternalStore, type ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { DiscussionAssistant } from '@deepseek-ai/dsh-api-discussion-controller/types'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import { AssistantSettings, type AssistantSettingsActions } from '../src/client/AssistantSettings.tsx'
import { en } from '../src/client/locales.ts'
import { ModelCatalogDirectory } from '../../ui-model-selection/src/client/catalog.ts'

afterEach(cleanup)
async function fixture() {
  const profile: DiscussionAssistant = { id: 'a' as DiscussionAssistant['id'], revision: 1, name: 'Analyst', instructions: '',
    template: 'temporary', memoryMode: 'off', archived: false, createdAt: 1, updatedAt: 1 }
  const save = vi.fn<AssistantSettingsActions['saveAssistant']>(async (_current, draft) => ({ ...profile, ...draft }))
  const value: ModelCatalog = { default: { provider: 'test', model: 'reviewer' }, routableProviders: ['test'], failures: [],
    groups: [{ id: 'test', name: 'Test provider', models: [{ id: 'reviewer', name: 'Reviewer model', reasoning: {
      defaultEffort: 'high', efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }],
    } }, { id: 'basic', name: 'Basic model' }] }] }
  const request = vi.fn(async () => ({ ok: true as const, value }))
  // The conversation has already loaded this Host-generation directory.
  const catalog = new ModelCatalogDirectory({ remote: { session: { modelCatalog: request } } } as never)
  await catalog.load()
  const actions: Omit<AssistantSettingsActions, 'hooks'> = {
    refreshModels: () => { catalog.refresh() },
    listAssistants: async () => [], saveAssistant: save, listMemories: async () => [],
    remember: vi.fn(), updateMemory: vi.fn(), forget: vi.fn(),
  }
  const useModels: ComponentProps<typeof AssistantSettings>['useModels'] = selector =>
    selector(useSyncExternalStore(catalog.store.subscribe, catalog.store.getSnapshot))
  const view = render(<AssistantSettings {...actions} useModels={useModels} t={makeTranslate(en)} />)
  await view.findByRole('option', { name: 'Reviewer model' })
  fireEvent.change(view.getByLabelText(en.model), { target: { value: JSON.stringify(['test', 'reviewer']) } })
  return { save, view, catalog, request, value }
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

it('reuses the loaded conversation catalog and follows updates without losing the assistant draft', async () => {
  const { view, request, catalog, value } = await fixture()
  expect(request).toHaveBeenCalledTimes(1)
  fireEvent.change(view.getByLabelText(en.name), { target: { value: 'Keep this draft' } })
  const pending = Promise.withResolvers<Awaited<ReturnType<typeof request>>>()
  request.mockReturnValueOnce(pending.promise)
  act(() => { catalog.refresh() })
  expect(view.getByRole('option', { name: 'Reviewer model' })).toBeTruthy()
  await act(async () => { pending.resolve({ ok: true, value: { ...value,
    groups: [{ id: 'test', name: 'Test provider', models: [{ id: 'new', name: 'Newly connected model' }] }] } }) })
  expect(await view.findByRole('option', { name: 'Newly connected model' })).toBeTruthy()
  expect(view.getByLabelText(en.name)).toHaveProperty('value', 'Keep this draft')
  expect(request).toHaveBeenCalledTimes(2)
})

it('shows failed and empty catalogs instead of perpetual loading and allows retry', async () => {
  const { view, request, catalog, value } = await fixture()
  request.mockRejectedValueOnce(new Error('Connection lost'))
  act(() => { catalog.resetGeneration() })
  expect((await view.findByRole('alert')).textContent).toContain('Connection lost')
  expect(view.getByRole('option', { name: en.modelsFailed })).toBeTruthy()
  request.mockResolvedValueOnce({ ok: true, value: { ...value, groups: [] } })
  fireEvent.click(view.getByRole('button', { name: en.refresh }))
  expect(await view.findByRole('option', { name: en.modelsEmpty })).toBeTruthy()
  fireEvent.click(view.getByRole('button', { name: en.refresh }))
  expect(await view.findByRole('option', { name: 'Reviewer model' })).toBeTruthy()
})

it('saves supported reasoning effort, clears it for model default, and resets it when switching models', async () => {
  const { view, save } = await fixture()
  fireEvent.change(view.getByLabelText(en.name), { target: { value: 'Deep reviewer' } })
  expect(view.getByRole('option', { name: 'Model default (High)' })).toBeTruthy()
  fireEvent.change(view.getByLabelText(en.reasoningEffort), { target: { value: 'max' } })
  fireEvent.click(view.getByRole('button', { name: en.save }))
  await waitFor(() => { expect(save).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ reasoningEffort: 'max' })) })
  await waitFor(() => { expect(view.getByRole('button', { name: en.save })).toHaveProperty('disabled', false) })
  fireEvent.change(view.getByLabelText(en.reasoningEffort), { target: { value: '' } })
  fireEvent.click(view.getByRole('button', { name: en.save }))
  await waitFor(() => { expect(save).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ reasoningEffort: undefined })) })
  await waitFor(() => { expect(view.getByRole('button', { name: en.save })).toHaveProperty('disabled', false) })
  fireEvent.change(view.getByLabelText(en.reasoningEffort), { target: { value: 'off' } })
  fireEvent.change(view.getByLabelText(en.model), { target: { value: JSON.stringify(['test', 'basic']) } })
  expect(view.getByLabelText(en.reasoningEffort)).toHaveProperty('disabled', true)
  expect(view.getByRole('option', { name: en.reasoningUnsupported })).toBeTruthy()
  fireEvent.click(view.getByRole('button', { name: en.save }))
  await waitFor(() => { expect(save).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ model: 'basic', reasoningEffort: undefined })) })
})

it('blocks a stale saved effort when the live model catalog removes that option', async () => {
  const { view, catalog, value } = await fixture()
  fireEvent.change(view.getByLabelText(en.name), { target: { value: 'Reviewer' } })
  fireEvent.change(view.getByLabelText(en.reasoningEffort), { target: { value: 'max' } })
  act(() => { catalog.store.set({ status: 'ready', error: null, value: { ...value,
    groups: [{ id: 'test', name: 'Test provider', models: [{ id: 'reviewer', name: 'Reviewer model',
      reasoning: { efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' } }] }],
  } }) })
  expect(view.getByRole('alert').textContent).toBe(en.reasoningUnavailable)
  expect(view.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
  fireEvent.change(view.getByLabelText(en.reasoningEffort), { target: { value: 'high' } })
  expect(view.getByRole('button', { name: en.save })).toHaveProperty('disabled', false)
})
