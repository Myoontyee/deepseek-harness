/** Content-only mirrors from explicitly authorized phones; never executable Session logs. */
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'

interface PhoneTurn { role: 'user' | 'assistant'; text: string; model: string; thinking: string }
interface PhoneNote { quote: string; comment: string }
/** Read-only transcript received from a phone. */
export interface PhoneConversation {
  id: string
  device: string
  title: string
  updated: number
  messages: PhoneTurn[]
  annotations: PhoneNote[]
}
const uuid = /^[a-f0-9-]{36}$/
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid phone transcript')
  return value as Record<string, unknown>
}
function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.length > limit) throw new Error('Invalid phone text')
  return value
}
/** Account and device scoped compressed storage sealed by Desktop safeStorage. */
export class PhoneConversations {
  private readonly summaries = new Map<string, Pick<PhoneConversation, 'id' | 'device' | 'title' | 'updated'>>()
  constructor(
    private readonly root: string,
    private readonly seal: (value: string) => Buffer,
    private readonly unseal: (value: Buffer) => string,
  ) {}
  /** Validate a bounded upload before any write, discarding credential and provider replay fields. */
  receive(device: string, label: string, input: unknown): void {
    if (!uuid.test(device)) throw new Error('Invalid phone identity')
    const payload = record(input)
    const source = text(payload.source, 64)
    if (!/^[a-f0-9]{64}$/.test(source) || !Array.isArray(payload.chats) || payload.chats.length > 20) throw new Error('Invalid phone sync')
    const updates = payload.chats.map((raw) => {
      const chat = record(raw), id = text(chat.id, 36)
      if (!uuid.test(id) || typeof chat.updated !== 'number' || !Number.isSafeInteger(chat.updated) || chat.updated < 0) throw new Error('Invalid phone revision')
      const messages = chat.messages, annotations = chat.annotations
      if (!Array.isArray(messages) || messages.length > 10000 || !Array.isArray(annotations) || annotations.length > 10000) throw new Error('Invalid phone content')
      const content: PhoneConversation = { id: `${device}/${source}/${id}`, device: label, title: text(chat.title, 200), updated: chat.updated,
        messages: messages.map((rawTurn) => {
          const turn = record(rawTurn), role = turn.role
          if (role !== 'user' && role !== 'assistant') throw new Error('Invalid phone role')
          return { role, text: text(turn.text, 3 * 1024 * 1024), model: text(turn.model ?? '', 256), thinking: text(turn.thinking ?? '', 3 * 1024 * 1024) }
        }), annotations: annotations.map((rawNote) => {
          const note = record(rawNote)
          return { quote: text(note.quote, 100000), comment: text(note.comment, 100000) }
        }) }
      if (chat.deleted !== undefined && typeof chat.deleted !== 'boolean') throw new Error('Invalid phone deletion')
      return { id, deleted: chat.deleted === true, content }
    })
    const directory = join(this.root, device, source)
    mkdirSync(directory, { recursive: true })
    if (readdirSync(directory).length + updates.filter(item => !item.deleted).length > 1020) throw new Error('Phone mirror storage limit reached')
    for (const update of updates) {
      const path = join(directory, update.id + '.dat')
      if (update.deleted) { try { unlinkSync(path) } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error } this.summaries.delete(update.content.id); continue }
      const encoded = gzipSync(JSON.stringify(update.content)).toString('base64')
      writeFileSync(path + '.tmp', this.seal(encoded), { mode: 0o600 }); renameSync(path + '.tmp', path)
      const { id, device: name, title, updated } = update.content
      this.summaries.set(id, { id, device: name, title, updated })
    }
  }
  /** Only currently authorized devices are visible. */
  list(devices: readonly { id: string }[]): Array<Pick<PhoneConversation, 'id' | 'device' | 'title' | 'updated'>> {
    const result: Array<Pick<PhoneConversation, 'id' | 'device' | 'title' | 'updated'>> = []
    for (const device of devices) {
      if (!uuid.test(device.id)) continue
      let sources: string[]
      try { sources = readdirSync(join(this.root, device.id)) } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue; throw error }
      for (const source of sources.filter(value => /^[a-f0-9]{64}$/.test(value)).slice(0, 32)) {
        const files = readdirSync(join(this.root, device.id, source)).filter(value => /^[a-f0-9-]{36}\.dat$/.test(value))
        for (const file of files.slice(0, 1000)) {
          const id = `${device.id}/${source}/${file.slice(0, -4)}`, chat = this.summaries.get(id) ?? this.read(id, devices)
          this.summaries.set(id, { id, device: chat.device, title: chat.title, updated: chat.updated })
          result.push({ id, device: chat.device, title: chat.title, updated: chat.updated })
        }
      }
    }
    return result.sort((left, right) => right.updated - left.updated).slice(0, 500)
  }
  /** Read one device-scoped record after grant and path validation. */
  read(id: string, devices: readonly { id: string }[]): PhoneConversation {
    const parts = id.split('/'), [device, source, chat] = parts
    if (parts.length !== 3 || !device || !source || !chat || !uuid.test(device) || !/^[a-f0-9]{64}$/.test(source)
      || !uuid.test(chat) || !devices.some(item => item.id === device)) throw new Error('Phone conversation unavailable')
    const sealed = readFileSync(join(this.root, device, source, chat + '.dat'))
    if (sealed.length > 16 * 1024 * 1024) throw new Error('Phone conversation too large')
    return JSON.parse(gunzipSync(Buffer.from(this.unseal(sealed), 'base64'), { maxOutputLength: 8 * 1024 * 1024 }).toString('utf8')) as PhoneConversation
  }
}
