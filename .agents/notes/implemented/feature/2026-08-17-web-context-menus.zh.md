# Agent Note: Right-click context menus in the Web GUI

Status: implemented

中文 | [English](2026-08-17-web-context-menus.md)

## Problem

Web GUI 没有统一的右键交互面。只有 `JsonTree` 和时间线轨迹打开过手写的菜单，消息行与代码面没有 Codex 式动作（复制为 Markdown、引用到输入框、编辑用户消息），共享的 `Menu` 原语不支持键盘导航——打开菜单后 Arrow/Home/End/Enter 都没有反应，也没有任何组件能在指针位置渲染菜单。

## Decision

`@deepseek-ai/dsh-client-ui-primitives` 拥有外壳。`Menu` 增加了可选 `keyboard` 属性实现 ARIA 菜单模式：条目带 roving `tabIndex={-1}`，Arrow/Home/End 移动高亮的 "active" 行（跳过 disabled、分隔线、label 与带子菜单的行），Enter/Space 选中 active 行，Tab 关闭，active 行在打开时与每次移动后持有焦点。active 行只在打开/关闭切换时重置，因此父组件重渲染（流式聊天分块重建条目数组）不会把高亮拉回第一项。新组件 `ContextMenu` 把 `Menu` 封装成指针 API——`{x, y, items, onSelect, onClose}`：通过 `getAnchorRect` 提供零尺寸合成矩形，启用 `portal` 与 `keyboard`，并渲染一个空 anchor，渲染点可以把它放在树中任何位置。

`ui-conversation` 通过新的 `MessageContextMenu` 把外壳接到消息行：右键用户、steering 或助手行会打开一个 portal 菜单，包含 复制（纯文本）、复制为 Markdown（有 markdown 源的条目）、引用（通过 `inputActions.setDraft` 与 `quoteIntoDraft` 助手把消息引用进输入框草稿）、编辑（仅用户行——把文本放回草稿）。复制成功后会在指针位置显示短暂的 复制成功 提示条。助手的复制源拼接该节点的 `text` 块；纯文本投影通过 `extractMarkdownPlainText` 得出。`AssistantNodeView`、`UserMessageNodeView` 与 `PendingSteeringBubble` 现在消费会话标准 kit 的 `useInput`/`inputActions`，这些本来就是它们 props 的一部分。

`CodeBlock` 增加了可选 `contextActions` 属性：渲染点在内置 复制 项下方追加自己的本地化动作；代码块在右键时打开菜单并 stopPropagation，因此消息级菜单不会叠加在其上。

`ui-tool` 的 `ToolRow` 在文件型行（args 里有路径且非错误行）上打开右键菜单：复制路径 写入路径并在原处把条目标签换成 复制成功 后自动关闭，打开文件 通过既有的 `onOpenFile` 宿主通道打开路径。`ChatView` 拥有选区菜单：右键命中非空浏览器选区时提供 复制（写入选区）与 解释所选内容（把解释提示词填入输入框草稿）。所有嵌套菜单拥有者（`MessageContextMenu`、`CodeBlock`、`ToolRow`）在 `hasActiveSelection()` 为真时保持事件未处理，让选区菜单接管，与 Codex 行为一致；共享的 `hasActiveSelection` 助手放在 `ui-primitives`。

Deferred：消息 重试（重新生成助手轮次需要不存在的宿主 regenerate 能力）、代码面的 应用到文件 / 打开终端（需要宿主文件/终端管线）、选区上的 发送到终端（需要终端输入通道）、diff 应用。

## Alternatives considered

**采用 `@radix-ui/react-context-menu`。** 无头 Radix 外壳是无障碍上下文菜单的生态标准，但会引入一个与 CSS Modules/`--dsw-*` token 样式契约冲突、并重复自有的 `Menu` 已有能力（portal 定位、外部点击/Escape 关闭、子菜单）的依赖。自有原语用一个小而可测的增量补上缺失的 20%（键盘导航、active 高亮、焦点）。

**采用 `react-contexify` 或 `@szhsin/react-menu`。** 两者都能快速上手，但样式自以为是且无障碍弱于 ARIA 模式；都无法与仓库的 token 和 CSS Module 规范组合。

**让 `Menu` 键盘导航始终开启。** 现有下拉选择器以鼠标为主，其消费者断言了当前行为；`keyboard` 属性让它们保持不变，而上下文菜单选择启用。

**客户端实现 regenerate（重试）。** 用户触发的重跑最后一条助手轮次需要宿主侧以会话日志支持重新驱动 agent loop；目前不存在该能力，因此消息菜单不带它发布，而不是伪造该动作。

## Consequences

菜单外壳在所有出现的地方都支持键盘访问，消息行、代码面、文件型工具行与实时选区都获得带复制反馈的 Codex 式动作。全量 `test:gui` 套件与 `ui-primitives`/`ui-conversation`/`ui-tool` 的聚焦组件规格钉住了行为；剩余的 Codex 表面（应用到文件、打开终端、选区发送到终端、diff 应用、重新生成）保持为明确的后续工作。`ui-conversation` 现在声明 `react-dom`（之前只有 `react`），因为 `MessageContextMenu` 要把复制提示条 portal 出去。
