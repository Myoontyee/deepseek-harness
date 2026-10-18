import './style.css'
import 'katex/dist/katex.min.css'
import katex from 'katex'
import { parseGfmWithMath } from '../../../packages/client/ui-primitives/src/markdown/parse.ts'
import { annotationSelectionMarkdown, registerMarkdownCopy, renderedClipboardText } from '../../../packages/client/ui-primitives/src/markdown/copy-selection.ts'
import { createCredentialTextMask } from '../../../packages/client/ui-secret-mask/src/client/masked-text.ts'

declare const phone: { postMessage(message: string): void; onmessage: (event: { data: string }) => void }
type Note = { id?: string; quote: string; comment: string; sent?: boolean }
type Turn = { role: string; text: string; thinking?: string; error?: string; model?: string; status?: string }
type Chat = {
  id: string
  title: string
  messages: Turn[]
  annotations: Note[]
  draft: string
  model?: string
  effort: string
  annotationDraft?: Note
}
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const input = el<HTMLTextAreaElement>('input'), model = el<HTMLSelectElement>('model'), effort = el<HTMLSelectElement>('effort')
const dialog = el<HTMLDialogElement>('annotation'), comment = el<HTMLTextAreaElement>('comment')
let chat: Chat | undefined, draft: Note = { quote: '', comment: '' }, selected = '', generating = false, saveTimer: ReturnType<typeof setTimeout>
const mask = createCredentialTextMask()
const send = (action: string, fields: Record<string, unknown> = {}) => phone.postMessage(JSON.stringify({ action, ...fields }))
function notice(text: string) { el('notice').textContent = text; el('notice').hidden = !text }
const button = (text: string, click: () => void) => { const node = document.createElement('button'); node.textContent = text; node.onclick = click; return node }
type Ast = { type: string; value?: string; url?: string; depth?: number; ordered?: boolean; start?: number; children?: Ast[] }
export function markdown(owner: HTMLElement, source: string) {
  owner.replaceChildren()
  function node(ast: Ast): Node {
    if (ast.type === 'text' || ast.type === 'html') return document.createTextNode(ast.value ?? '')
    if (ast.type === 'inlineMath' || ast.type === 'math') {
      const math = document.createElement(ast.type === 'math' ? 'div' : 'span')
      math.dataset.copyMath = ast.value ?? ''; math.dataset.copyMathDisplay = String(ast.type === 'math')
      katex.render(ast.value ?? '', math, { displayMode: ast.type === 'math', throwOnError: false, trust: false, maxExpand: 1000 }); return math
    }
    const tags: Record<string, string> = { root: 'div', paragraph: 'p', heading: `h${Math.min(6, ast.depth ?? 2)}`, strong: 'strong', emphasis: 'em', delete: 'del', blockquote: 'blockquote', list: ast.ordered ? 'ol' : 'ul', listItem: 'li', table: 'table', tableRow: 'tr', tableCell: 'td', code: 'pre', inlineCode: 'code', break: 'br', thematicBreak: 'hr', link: 'a', image: 'span' }
    const element = document.createElement(tags[ast.type] ?? 'span')
    if (ast.type === 'link' && ast.url) { try { const url = new URL(ast.url); if (['http:', 'https:', 'mailto:'].includes(url.protocol)) { element.setAttribute('href', url.href); element.setAttribute('rel', 'noreferrer') } } catch { /* Invalid links remain readable text. */ } }
    if (ast.value) element.textContent = ast.value
    if (ast.type === 'image') element.textContent = '[图片]'
    for (const child of ast.children ?? []) element.append(node(child))
    return element
  }
  owner.append(node(parseGfmWithMath(mask(source)) as Ast))
}
const copies: (() => void)[] = []
function renderTurns() {
  for (const dispose of copies.splice(0)) dispose()
  const owner = el('messages'), bottom = owner.scrollHeight - owner.scrollTop - owner.clientHeight < 120
  owner.replaceChildren()
  if (!chat?.messages.length) { const empty = document.createElement('div'); empty.className = 'welcome'; empty.textContent = '你好，今天想聊些什么？\n直接使用你的 DeepSeek 账号，连接电脑是可选项。'; owner.append(empty) }
  chat?.messages.forEach((turn, index) => {
    const row = document.createElement('article'); row.className = turn.role; row.dataset.index = String(index)
    const heading = document.createElement('small'); heading.textContent = turn.role === 'user' ? '你' : `DeepSeek · ${turn.model ?? ''}`; row.append(heading)
    if (turn.thinking) { const details = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('div'); summary.textContent = '思考过程'; body.className = 'thinking'; body.textContent = mask(turn.thinking); details.append(summary, body); row.append(details) }
    const content = document.createElement('div'); content.className = 'markdown'
    if (turn.status === 'generating') { content.textContent = mask(turn.text || '正在思考…'); content.classList.add('streaming') } else markdown(content, turn.text)
    row.append(content); copies.push(registerMarkdownCopy(content))
    if (turn.error) { const error = document.createElement('p'); error.className = 'error'; error.textContent = turn.error; row.append(error) }
    row.append(button('复制', () => send('copy', { text: renderedClipboardText(content) })))
    owner.append(row)
  })
  if (bottom) owner.scrollTop = owner.scrollHeight
}
function renderNotes() {
  const owner = el('notes'); owner.replaceChildren()
  for (const note of chat?.annotations ?? []) {
    const item = document.createElement('details'), title = document.createElement('summary'); title.textContent = `${note.sent ? '已发送批注' : '待发送批注'} · ${note.comment || note.quote}`.slice(0, 60)
    const quote = document.createElement('blockquote'); markdown(quote, note.quote)
    const body = document.createElement('p'); body.textContent = mask(note.comment)
    item.append(title, quote, body, button('编辑', () => openNote(note)), button('删除', () => send('deleteAnnotation', { id: note.id }))); owner.append(item)
  }
}
function persist() { clearTimeout(saveTimer); if (chat) send('draft', { text: input.value, model: model.value, effort: effort.value, annotationDraft: draft }) }
function schedule() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 220) }
function openNote(note: Note) {
  if (!note.id && !note.comment && draft.quote && draft.comment && !dialog.open) note = draft
  draft = { ...note }; markdown(el('quote'), note.quote); comment.value = note.comment; if (!dialog.open) dialog.showModal(); comment.focus(); persist()
}
function closeNote() { draft.comment = comment.value; persist(); dialog.close(); notice('批注草稿已暂存，点此继续编辑') }
el('cancelNote').onclick = closeNote
dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeNote() })
comment.oninput = () => { draft.comment = comment.value; schedule() }
function saveNote() { draft.comment = comment.value; persist(); send('annotation', { note: draft }); draft = { quote: '', comment: '' }; dialog.close(); notice('') }
el('saveNote').onclick = saveNote
el('selection').onpointerdown = event => event.preventDefault()
el('selection').onclick = () => { if (selected) openNote({ quote: selected, comment: '' }); el('selection').hidden = true }
document.addEventListener('selectionchange', () => {
  if (dialog.open) return
  const selection = getSelection(); selected = ''
  if (selection && !selection.isCollapsed && selection.rangeCount) {
    const range = selection.getRangeAt(0)
    const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
    const anchor = start?.closest<HTMLElement>('.markdown')
    if (anchor) selected = annotationSelectionMarkdown(anchor, range)
  }
  el('selection').hidden = !selected
})
el('settings').onclick = () => { persist(); send('settings') }
el('new').onclick = () => { persist(); send('new') }
el('history').onclick = () => { el('drawer').hidden = false; send('remoteChats') }
el('refreshRemote').onclick = () => send('remoteChats')
el('closeHistory').onclick = () => { el('drawer').hidden = true }
el('delete').onclick = () => { if (confirm('删除当前手机对话？已同步电脑的副本也将在下次同步时删除。')) { send('delete'); el('drawer').hidden = true } }
el('refreshModels').onclick = () => send('models')
el('stop').onclick = () => send('stop')
function submit() { if (!generating) { persist(); send('send', { text: input.value, model: model.value, effort: effort.value }) } }
el('send').onclick = submit
input.oninput = schedule; model.onchange = schedule; effort.onchange = schedule
document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); if (dialog.open) saveNote(); else submit() } })
window.addEventListener('pagehide', persist)
phone.onmessage = (event) => {
  const update = JSON.parse(event.data)
  if (update.type === 'error') { notice(update.message); return }
  if (update.type === 'remote') {
    const root = el('remoteChats'); let group = Array.from(root.children).find(item => item.getAttribute('data-device') === update.device)
    if (!group) { group = document.createElement('section'); group.setAttribute('data-device', update.device); root.append(group) }
    group.replaceChildren(); const heading = document.createElement('small'); heading.textContent = update.name; group.append(heading)
    if (update.error) { const error = document.createElement('small'); error.textContent = update.error; group.append(error) }
    for (const item of update.sessions) {
      const row = button('', () => { persist(); send('remoteOpen', { device: update.device, id: item.id }) })
      const title = document.createElement('span'); title.textContent = item.title
      const globe = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); globe.setAttribute('viewBox', '0 0 24 24'); globe.setAttribute('width', '16'); globe.setAttribute('height', '16'); globe.setAttribute('fill', 'none'); globe.setAttribute('stroke', 'currentColor'); globe.setAttribute('aria-label', '远程对话'); globe.innerHTML = '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>'
      row.title = `${update.name} · 远程对话`; row.className = 'remote-row'; row.append(title, globe); group.append(row)
    }
    return
  }
  if (update.type === 'turn') {
    if (chat?.id === update.id) {
      chat.messages[chat.messages.length - 1] = update.turn
      const owner = el('messages'), row = owner.lastElementChild, body = row?.querySelector<HTMLElement>('.markdown')
      const bottom = owner.scrollHeight - owner.scrollTop - owner.clientHeight < 120
      if (body) body.textContent = mask(update.turn.text || '正在思考…')
      const thinking = row?.querySelector<HTMLElement>('.thinking'); if (thinking) thinking.textContent = mask(update.turn.thinking ?? '')
      if (bottom) owner.scrollTop = owner.scrollHeight
    }
    return
  }
  if (update.type !== 'state') return
  const changed = !chat || chat.id !== update.chat.id, prior = chat
  chat = update.chat; generating = update.generating
  const currentModel = changed ? chat?.model : model.value
  model.replaceChildren()
  for (const item of update.models) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.available ? item.name : `${item.name} · 需更新`; option.disabled = !item.available; model.append(option) }
  if (!model.options.length) { const option = document.createElement('option'); option.value = ''; option.textContent = '模型未加载，点 ↻ 重试'; model.append(option) }
  if (currentModel && Array.from(model.options).some(item => item.value === currentModel)) model.value = currentModel
  if (changed) { input.value = chat?.draft ?? ''; effort.value = chat?.effort ?? 'high'; draft = chat?.annotationDraft?.quote ? chat.annotationDraft : { quote: '', comment: '' }; if (dialog.open) dialog.close(); if (draft.quote) notice('已恢复未完成的批注，点此继续'); else notice('') }
  else if (chat && prior && chat.messages.length > prior.messages.length && chat.messages.at(-1)?.status === 'generating') input.value = ''
  el('notice').onclick = () => { if (draft.quote) openNote(draft) }
  el('stop').hidden = !generating; el('send').hidden = generating; el<HTMLButtonElement>('send').disabled = !model.value
  el('chats').replaceChildren(...update.chats.map((item: { id: string; title: string }) => button(item.title, () => { persist(); send('open', { id: item.id }); el('drawer').hidden = true })))
  renderTurns(); renderNotes()
}
send('init')
