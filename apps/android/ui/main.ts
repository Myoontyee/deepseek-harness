import './style.css'
import 'katex/dist/katex.min.css'
import katex from 'katex'
import { parseGfmWithMath } from '../../../packages/client/ui-primitives/src/markdown/parse.ts'
import { annotationSelectionMarkdown, registerMarkdownCopy, renderedClipboardText } from '../../../packages/client/ui-primitives/src/markdown/copy-selection.ts'
import { createCredentialTextMask } from '../../../packages/client/ui-secret-mask/src/client/masked-text.ts'
import icons from 'virtual:phone-icons'

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
for (const node of document.querySelectorAll<HTMLElement>('[data-icon]')) node.innerHTML = icons[node.dataset.icon!]
const theme = matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.body.toggleAttribute('data-ds-dark-theme', theme.matches)
theme.addEventListener('change', applyTheme); applyTheme()
function viewport() {
  const height = window.visualViewport?.scale === 1 ? window.visualViewport.height : innerHeight
  if (!window.visualViewport || window.visualViewport.scale === 1) {
    document.documentElement.style.setProperty('--phone-height', `${height}px`)
    document.body.toggleAttribute('data-compact-height', height <= 500)
  }
  document.documentElement.style.setProperty('--selection-bottom', `${el('input').closest('footer')!.getBoundingClientRect().height + 8}px`)
}
window.visualViewport?.addEventListener('resize', viewport)
window.addEventListener('resize', viewport)
new ResizeObserver(viewport).observe(el('input').closest('footer')!)
function growInput() { input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px` }
let drawerReturn: HTMLElement | null = null
function drawerLayout() {
  const modal = !el('drawer').hidden && matchMedia('(max-width: 899px)').matches
  if (modal) { el('drawer').setAttribute('role', 'dialog'); el('drawer').setAttribute('aria-modal', 'true') }
  else { el('drawer').removeAttribute('role'); el('drawer').removeAttribute('aria-modal') }
  document.querySelector<HTMLElement>('.conversation')!.inert = modal
}
matchMedia('(max-width: 899px)').addEventListener('change', drawerLayout)
function drawer(open: boolean) {
  if (open) drawerReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null
  el('drawer').hidden = !open; el('drawerBackdrop').hidden = !open
  el('history').setAttribute('aria-expanded', String(open))
  drawerLayout()
  if (open) el('closeHistory').focus(); else drawerReturn?.focus()
}
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
    const copy = button('', () => send('copy', { text: renderedClipboardText(content) })); copy.className = 'icon-button'; copy.setAttribute('aria-label', '复制消息'); copy.innerHTML = icons.copy; row.append(copy)
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
document.addEventListener('dsh:annotate-selection', (event) => {
  if (dialog.open) { event.preventDefault(); return }
  const selection = getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return
  const range = selection.getRangeAt(0), start = range.startContainer, end = range.endContainer
  const owner = (start instanceof Element ? start : start.parentElement)?.closest<HTMLElement>('.markdown')
  if (!owner || !owner.contains(end) || !el('messages').contains(owner)) return
  const quote = annotationSelectionMarkdown(owner, range)
  if (!quote.trim()) return
  event.preventDefault(); openNote({ quote, comment: '' }); el('selection').hidden = true
})
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
el('settings').onclick = () => { persist(); drawer(false); send('settings') }
el('new').onclick = el('sidebarNew').onclick = () => { persist(); drawer(false); send('new') }
el('history').onclick = () => { const open = el('drawer').hidden; drawer(open); if (open) send('remoteChats') }
el('refreshRemote').onclick = () => send('remoteChats')
el('closeHistory').onclick = el('drawerBackdrop').onclick = () => drawer(false)
el('delete').onclick = () => { if (confirm('删除当前手机对话？已同步电脑的副本也将在下次同步时删除。')) { send('delete'); drawer(false) } }
el('refreshModels').onclick = () => send('models')
el('stop').onclick = () => send('stop')
function submit() { if (!generating) { persist(); send('send', { text: input.value, model: model.value, effort: effort.value }) } }
el('send').onclick = submit
input.oninput = () => { growInput(); schedule() }; model.onchange = schedule; effort.onchange = schedule
document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); if (dialog.open) saveNote(); else submit() } })
document.addEventListener('keydown', (event) => {
  if (dialog.open || el('drawer').hidden) return
  if (event.key === 'Escape') { event.preventDefault(); drawer(false); return }
  if (event.key !== 'Tab' || !matchMedia('(max-width: 899px)').matches) return
  const controls = Array.from(el('drawer').querySelectorAll<HTMLElement>('button:not(:disabled)'))
  const first = controls[0], last = controls.at(-1)
  const target = event.shiftKey && document.activeElement === first ? last
    : !event.shiftKey && document.activeElement === last ? first : undefined
  if (target) { event.preventDefault(); target.focus() }
})
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
      const row = button('', () => { persist(); drawer(false); send('remoteOpen', { device: update.device, id: item.id }) })
      const title = document.createElement('span'); title.textContent = item.title; title.className = 'chat-title'
      const globe = document.createElement('span'); globe.innerHTML = icons.globe; globe.setAttribute('aria-label', '远程对话')
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
  el('title').textContent = chat?.title || '新对话'; el('title').title = chat?.title || '新对话'
  const currentModel = changed ? chat?.model : model.value
  model.replaceChildren()
  for (const item of update.models) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.available ? item.name : `${item.name} · 需更新`; option.disabled = !item.available; model.append(option) }
  if (!model.options.length) { const option = document.createElement('option'); option.value = ''; option.textContent = '模型未加载，点 ↻ 重试'; model.append(option) }
  if (currentModel && Array.from(model.options).some(item => item.value === currentModel)) model.value = currentModel
  if (changed) { input.value = chat?.draft ?? ''; effort.value = chat?.effort ?? 'high'; draft = chat?.annotationDraft?.quote ? chat.annotationDraft : { quote: '', comment: '' }; if (dialog.open) dialog.close(); if (draft.quote) notice('已恢复未完成的批注，点此继续'); else notice('') }
  else if (chat && prior && chat.messages.length > prior.messages.length && chat.messages.at(-1)?.status === 'generating') input.value = ''
  el('notice').onclick = () => { if (draft.quote) openNote(draft) }
  el('stop').hidden = !generating; el('send').hidden = generating; el<HTMLButtonElement>('send').disabled = !model.value
  el('chats').replaceChildren(...update.chats.map((item: { id: string; title: string }) => {
    const row = button('', () => { persist(); send('open', { id: item.id }); drawer(false) })
    const title = document.createElement('span'); title.className = 'chat-title'; title.textContent = item.title; row.title = item.title; row.append(title)
    if (item.id === chat?.id) row.setAttribute('aria-current', 'page')
    return row
  }))
  growInput(); renderTurns(); renderNotes()
}
viewport()
if (matchMedia('(min-width: 900px)').matches) drawer(true)
send('init')
