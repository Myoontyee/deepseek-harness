/**
 * Codex 风格右键菜单 + 斜杠指令 Tab 补全（浏览器端）。
 *
 * - 右键消息/代码块/选中文本 → 复制 / 复制为 Markdown / 添加到上下文 / 解释 / 插入新消息
 * - 输入 `/` 后按 Tab（或可配置快捷键）→ 补全为高亮/首个模糊候选命令名（带认领空格）
 *
 * 菜单用原生 DOM 渲染（独立于官方 React 树），动作基于公开服务
 * （writeClipboard、ctx.conversation.send、composer DOM 路径）。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
// 设置类型本地化：type import 会拉入 host 模块图（含 purity 违规的值 import）。
type CodexMenuSettings = { completeShortcut: 'Tab' | 'Ctrl+Space' | 'None' }
// settings namespace 字符串与 host 面的 settingsNamespace('codex-menu') 对应；
// 值 import 会触发 client bundle purity gate（cross-plugin 值引用）。
const CODX_MENU_SETTINGS_NS = 'codex-menu' as const

export const name = 'dsh-client-ui-codex-menu'
export const inject = ['conversation', 'settingsScope']

/** 右键场景。 */
type MenuTarget =
  | { kind: 'message'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'selection'; text: string }

/** 菜单动作。 */
type MenuAction =
  | { kind: 'copy' }
  | { kind: 'copyMarkdown' }
  | { kind: 'explain' }
  | { kind: 'insert' }
  | { kind: 'addToContext' }

const ACTION_LABELS: Record<MenuAction['kind'], string> = {
  copy: '复制',
  copyMarkdown: '复制为 Markdown',
  explain: '解释这段内容',
  insert: '在此处插入新消息…',
  addToContext: '添加到上下文',
}

/** 从右键事件目标向上找消息行文本（data-chat-anchor-key 行内文本）。 */
function messageTextOf(target: EventTarget | null): string | undefined {
  const element = target instanceof Element ? target : null
  if (element === null) return undefined
  const row = element.closest<HTMLElement>('[data-chat-anchor-key]')
  if (row === null) return undefined
  const text = row.innerText.trim()
  return text === '' ? undefined : text
}

/** 从右键事件目标向上找代码块文本（pre/code 元素）。 */
function codeTextOf(target: EventTarget | null): string | undefined {
  const element = target instanceof Element ? target : null
  if (element === null) return undefined
  const block = element.closest<HTMLElement>('pre, code')
  if (block === null) return undefined
  const text = block.textContent?.trim()
  return text === undefined || text === '' ? undefined : text
}

/** 当前选择文本（非空时优先）。 */
function selectionText(): string | undefined {
  const selection = window.getSelection()
  if (selection === null || selection.isCollapsed) return undefined
  const text = selection.toString().trim()
  return text === '' ? undefined : text
}

/**
 * 解析右键事件目标 → 菜单场景。
 * 优先级：选择文本 > 代码块 > 消息行；仅接管对话区域内的右键。
 */
function resolveTarget(target: EventTarget | null): MenuTarget | undefined {
  const element = target instanceof Element ? target : null
  if (element === null) return undefined
  if (element.closest('[data-composer-seat]') !== null) return undefined
  const inConversation = element.closest('[data-conversation-scroll], [data-chat-anchor-key]') !== null
  if (inConversation) {
    const selection = selectionText()
    if (selection !== undefined) return { kind: 'selection', text: selection }
  }
  const code = codeTextOf(target)
  if (code !== undefined) return { kind: 'code', text: code }
  const message = messageTextOf(target)
  if (message !== undefined) return { kind: 'message', text: message }
  return undefined
}

/** 右键菜单项列表（按场景）。 */
function menuActionsFor(target: MenuTarget): MenuAction[] {
  if (target.kind === 'selection') {
    return [{ kind: 'copy' }, { kind: 'addToContext' }, { kind: 'explain' }]
  }
  if (target.kind === 'code') {
    return [{ kind: 'copy' }, { kind: 'copyMarkdown' }, { kind: 'addToContext' }]
  }
  return [{ kind: 'copy' }, { kind: 'copyMarkdown' }, { kind: 'addToContext' }, { kind: 'explain' }, { kind: 'insert' }]
}

const MENU_STYLE = [
  'position:fixed',
  'z-index:2147483000',
  'min-width:210px',
  'background:#fafafa',
  'border:1px solid #e4e4e4',
  'border-radius:8px',
  'box-shadow:0 8px 28px rgba(0,0,0,.14)',
  'padding:4px',
  'font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
  'user-select:none',
].join(';')

const ITEM_STYLE = [
  'padding:7px 12px',
  'font-size:12.5px',
  'color:#1a1a1a',
  'border-radius:5px',
  'cursor:pointer',
  'white-space:nowrap',
  'display:flex',
  'justify-content:space-between',
  'gap:24px',
].join(';')

const SHORTCUT_STYLE = 'color:#999;font-size:11px'

/** 用原生 DOM 构建并挂载菜单；返回卸载函数。 */
function mountMenu(target: MenuTarget, x: number, y: number, conversation: IConversation, onClose: () => void): () => void {
  const actions = menuActionsFor(target)
  const container = document.createElement('div')
  container.style.cssText = MENU_STYLE
  container.dataset.codexMenu = 'true'
  container.setAttribute('role', 'menu')

  for (const action of actions) {
    const item = document.createElement('div')
    item.setAttribute('role', 'menuitem')
    item.style.cssText = ITEM_STYLE
    item.textContent = ACTION_LABELS[action.kind]
    if (action.kind === 'copy') {
      const shortcut = document.createElement('span')
      shortcut.style.cssText = SHORTCUT_STYLE
      shortcut.textContent = 'Ctrl+C'
      item.appendChild(shortcut)
    }
    item.addEventListener('mouseenter', () => { item.style.background = '#f0f0f0' })
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent' })
    item.addEventListener('click', () => {
      void runAction(action, target, conversation)
      onClose()
    })
    container.appendChild(item)
  }

  const estimatedHeight = actions.length * 31 + 8
  const left = x + container.offsetWidth + 8 > window.innerWidth ? Math.max(4, x - 216) : x
  const top = y + estimatedHeight > window.innerHeight ? Math.max(4, y - estimatedHeight) : y
  container.style.left = `${left}px`
  container.style.top = `${top}px`
  document.body.appendChild(container)
  return () => { container.remove() }
}

/** 执行菜单动作。 */
async function runAction(action: MenuAction, target: MenuTarget, conversation: IConversation): Promise<void> {
  switch (action.kind) {
    case 'copy':
    case 'copyMarkdown':
      await writeClipboard(target.text)
      break
    case 'addToContext': {
      // Codex「添加到上下文」：选中内容进入输入框（可编辑），随下一条消息发送给模型。
      // composer 的 draft 状态通过 React 受控组件管理；原生写 value 后派发
      // input 事件即可进入状态机（已验证）。会话级 input 服务需要会话绑定
      // ctx，全局 ctx 拿不到，故走 DOM 路径。
      const seat = document.querySelector('[data-composer-seat]')
      const editable = seat?.querySelector<HTMLElement>('textarea, [contenteditable]')
      if (editable === null || editable === undefined) break
      const current = editable instanceof HTMLTextAreaElement ? editable.value : (editable.textContent ?? '')
      const next = current.length === 0 ? target.text : `${current}\n\n${target.text}`
      if (editable instanceof HTMLTextAreaElement) {
        editable.value = next
        editable.dispatchEvent(new Event('input', { bubbles: true }))
      } else {
        editable.textContent = next
        editable.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: next }))
      }
      break
    }
    case 'explain':
      await conversation.send(`请解释以下内容：\n\n${target.text}`)
      break
    case 'insert':
      await conversation.send(target.text)
      break
  }
}

/** 触发键 → KeyboardEvent.key 匹配。 */
function shortcutMatches(event: KeyboardEvent, shortcut: CodexMenuSettings['completeShortcut']): boolean {
  if (shortcut === 'None') return false
  if (shortcut === 'Tab') return event.key === 'Tab' && !event.ctrlKey && !event.metaKey
  return event.key === ' ' && (event.ctrlKey || event.metaKey)
}

/** 从候选 option 元素解析命令名：命令名在第一个 span（类名哈希不稳定，按结构取）。 */
function candidateNameOf(option: Element): string {
  const nameSpan = option.querySelector('span')
  if (nameSpan !== null) {
    const name = nameSpan.textContent?.trim()
    if (name !== undefined && name !== '') return name
  }
  return (option.textContent ?? '').trim().split(/\s+/)[0] ?? ''
}

/** 斜杠指令 Tab 补全：候选菜单开着时按快捷键 = 把当前输入补全为候选命令名。 */
function installTabComplete(ctx: ClientContext): () => void {
  const scope = ctx.settingsScope.bind<CodexMenuSettings>({
    namespace: CODX_MENU_SETTINGS_NS,
  })
  const readShortcut = (): CodexMenuSettings['completeShortcut'] =>
    scope.getSnapshot().value?.completeShortcut ?? 'Tab'
  let shortcut = readShortcut()
  scope.subscribe(() => { shortcut = readShortcut() })
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!shortcutMatches(event, shortcut)) return
    const target = event.target
    if (!(target instanceof Element) || target.closest('[data-composer-seat]') === null) return
    // 仅在命令名补全阶段：输入以 / 开头且未认领（无空格）。
    const current = target instanceof HTMLTextAreaElement ? target.value : (target.textContent ?? '')
    if (!current.startsWith('/') || current.includes(' ')) return
    const listbox = document.querySelector('[role="listbox"]')
    if (listbox === null) return
    const options = [...listbox.querySelectorAll('[role="option"]')]
    if (options.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    const selected = options.find(option => option.getAttribute('aria-selected') === 'true')
      ?? options[0]
    const name = candidateNameOf(selected ?? options[0] as Element)
    if (name === '') return
    // 补全为完整命令并带认领空格（官方语义：命令名 + 空格进入参数模式）。
    const completed = `/${name} `
    if (target instanceof HTMLTextAreaElement) {
      target.value = completed
      target.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      target.textContent = completed
      target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: completed }))
    }
  }
  document.addEventListener('keydown', onKeyDown, true)
  return () => document.removeEventListener('keydown', onKeyDown, true)
}

/** 注册全局右键菜单层与 Tab 补全。 */
export function apply(ctx: ClientContext): void {
  const conversation = ctx.conversation
  ctx.effect(() => {
    let current: { target: MenuTarget; x: number; y: number } | null = null
    let unmount: (() => void) | null = null
    const close = (): void => {
      if (unmount !== null) {
        unmount()
        unmount = null
      }
      current = null
    }
    const onContextMenu = (event: MouseEvent): void => {
      const target = resolveTarget(event.target)
      if (target === undefined) return
      event.preventDefault()
      event.stopPropagation()
      close()
      current = { target, x: event.clientX, y: event.clientY }
      unmount = mountMenu(target, event.clientX, event.clientY, conversation, close)
    }
    const onPointerDown = (event: PointerEvent): void => {
      const insideMenu = event.target instanceof Element && event.target.closest('[data-codex-menu]') !== null
      if (current !== null && !insideMenu) close()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && current !== null) close()
    }
    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      close()
    }
  }, 'ui-codex-menu: global context menu')

  ctx.effect(() => installTabComplete(ctx), 'ui-codex-menu: tab complete')
}
