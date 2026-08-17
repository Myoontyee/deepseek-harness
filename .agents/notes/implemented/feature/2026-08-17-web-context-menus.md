# Agent Note: Right-click context menus in the Web GUI

Status: implemented

English | [中文](2026-08-17-web-context-menus.zh.md)

## Problem

The Web GUI had no unified right-click surface. Only `JsonTree` and the trajectory timeline opened hand-rolled menus, message rows and code surfaces offered no Codex-style actions (copy as markdown, quote into the composer, edit a user message), and the shared `Menu` primitive supported no keyboard navigation — Arrow/Home/End/Enter did nothing inside an open menu, and nothing rendered a menu at the pointer position.

## Decision

`@deepseek-ai/dsh-client-ui-primitives` owns the shell. `Menu` gained an opt-in `keyboard` prop implementing the ARIA menu pattern: items carry roving `tabIndex={-1}`, Arrow/Home/End move a highlighted "active" row (skipping disabled, separator, label, and submenu-parent rows), Enter/Space select the active row, Tab closes, and the active row owns focus on open and after every move. The active row resets only at open/close transitions, so a parent re-render that rebuilds the item array (streaming chat chunks) cannot yank the highlight. The new `ContextMenu` component wraps `Menu` behind a pointer API — `{x, y, items, onSelect, onClose}`: it supplies a zero-size synthetic rect through `getAnchorRect`, enables `portal` plus `keyboard`, and renders an empty anchor so render sites may mount it anywhere in the tree.

`ui-conversation` wires the shell into message rows through the new `MessageContextMenu`: right-clicking a user, steering, or assistant row opens a portaled menu with 复制 (plain text), 复制为 Markdown (rows with markdown source), 引用 (quote into the composer draft through `inputActions.setDraft` and the `quoteIntoDraft` helper), and 编辑 (user rows only — puts the text back in the draft). A successful copy shows a transient 复制成功 chip at the pointer position. Assistant copy sources join the node's `text` blocks; the plain-text projection derives through `extractMarkdownPlainText`. `AssistantNodeView`, `UserMessageNodeView`, and `PendingSteeringBubble` now consume the session standard kit's `useInput`/`inputActions`, which their props already carried.

`CodeBlock` gained an optional `contextActions` prop: render sites append their own localized actions below the built-in 复制 item; the block opens the menu on right-click and stops propagation so a message-level menu never stacks above it.

`ui-tool`'s `ToolRow` opens a right-click menu on file-backed rows (a path in the args, outside an error row): 复制路径 writes the path and swaps the item label to 复制成功 in place before closing itself, and 打开文件 opens the path through the existing `onOpenFile` host channel. `ChatView` owns the selection menu: a right-click over a non-empty browser selection offers 复制 (write the selection) and 解释所选内容 (fill the composer draft with an explain prompt). Every nested menu owner (`MessageContextMenu`, `CodeBlock`, `ToolRow`) yields to the selection menu by leaving the event unhandled when `hasActiveSelection()` is true, so the selection wins exactly like Codex; the shared `hasActiveSelection` helper lives in `ui-primitives`.

Deferred: message 重试 (regenerating an assistant turn needs a host regenerate capability that does not exist), 应用到文件 / 打开终端 on code surfaces (needs host file/terminal plumbing), 发送到终端 on selections (needs a terminal input channel), and diff apply.

## Alternatives considered

**Adopt `@radix-ui/react-context-menu`.** The headless Radix shell is the ecosystem standard for accessible context menus, but it would add a dependency that fights the CSS-Modules/`--dsw-*`-token styling contract and duplicate what the owned `Menu` already provides (portal positioning, outside-click/Escape close, submenus). The owned primitive covers the missing 20% (keyboard nav, active highlight, focus) in a small, testable delta.

**Adopt `react-contexify` or `@szhsin/react-menu`.** Both are quick wins with opinionated styling and weaker accessibility than the ARIA pattern; neither composes with the repo's token and CSS-Module discipline.

**Make `Menu` keyboard navigation always-on.** The existing dropdown pickers are mouse-first and their consumers assert current behavior; the `keyboard` prop keeps them untouched while context menus opt in.

**Implement regenerate (重试) client-side.** A user-triggered re-run of the last assistant turn requires host-side re-driving of the agent loop with session-log support; no such capability exists, so the message menu ships without it rather than faking the action.

## Consequences

The menu shell is keyboard-accessible everywhere it appears, and message rows, code surfaces, file-backed tool rows, and live selections gain Codex-style actions with copy feedback. The full `test:gui` suite and the focused `ui-primitives`/`ui-conversation`/`ui-tool` component specs pin the behavior; the remaining Codex surfaces (apply-to-file, open-in-terminal, send-selection-to-terminal, diff apply, regenerate) stay explicit follow-ups. `ui-conversation` now declares `react-dom` (previously only `react`) because `MessageContextMenu` portals its copy chip.
