/** Actual SQLite reopen verifies that closing a view never owns discussion deletion. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { Config, SqliteStorageBackend } from '@deepseek-ai/dsh-storage-sqlite'
import { assistantRecord, discussionDomainSpec, memoryRecord, topicRecord } from '../src/spec.ts'

it('retains assistant, disabled memory and archived topic after closing and reopening the database', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'dsh-discussion-persistence-'))
  const path = join(scratch, 'state.sqlite')
  const profile = assistantRecord.parse({ id: 'assistant-a', revision: 1, name: 'Analyst', instructions: 'Read only',
    template: 'temporary', memoryMode: 'off', archived: false, createdAt: 1, updatedAt: 1 })
  const memory = memoryRecord.parse({ id: 'memory-a', assistantId: profile.id, revision: 1, scope: 'assistant',
    project: '', text: 'Saved preference', createdAt: 1, updatedAt: 1 })
  const topic = topicRecord.parse({ id: 'topic-a', parentSessionId: 'main-a', sessionId: 'discussion-a', assistantId: profile.id,
    revision: 1, title: 'A question', quote: '$CNR < 1$', sourceUrl: 'dsh://session/main-a', sourceMessage: 'm1',
    project: 'workspace-a', state: 'archived', createdAt: 1, updatedAt: 1 })
  try {
    for (const first of [true, false]) {
      const ctx = new Context(), backend = new SqliteStorageBackend(new Config({ path }))
      try {
        await ctx.plugin(Storage)
        ctx.storage.backend.register('test-sqlite', backend)
        const facility = new DomainFacility(ctx, { backend: 'test-sqlite', routes: {} })
        const domain = await facility.open(discussionDomainSpec)
        try {
          if (first) {
            await domain.table('assistants').put(profile.id, profile)
            await domain.table('memories').put(memory.id, memory)
            await domain.table('topics').put(topic.id, topic)
          } else {
            expect(domain.table('assistants').get(profile.id)).toEqual(profile)
            expect(domain.table('memories').get(memory.id)).toEqual(memory)
            expect(domain.table('topics').get(topic.id)).toEqual(topic)
            expect(domain.table('topics').get(topic.id)).not.toHaveProperty('messages')
          }
        } finally { await domain.close() }
      } finally { await ctx.fiber.dispose(); await backend.close() }
    }
  } finally {
    if (!resolve(scratch).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected test cleanup directory')
    await rm(scratch, { recursive: true, force: true })
  }
})
