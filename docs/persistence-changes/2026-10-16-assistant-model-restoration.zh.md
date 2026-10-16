---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-16-assistant-model-restoration

[English](2026-10-16-assistant-model-restoration.md) | 中文

## 概述

防止临时常驻助手调用覆盖主对话模型。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-16-assistant-model-restoration
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-16-saved-assistant-speakers"
    after: "1cb622db8507ee96d35bbd5fc948859229f2d42fbb69fa528c8667de6641a512"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-16-saved-assistant-speakers"
    after: "8c4709ec7f40316d19863367526333afc753ff6cec0f014bfb096a0d65be3a0c"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-16-saved-assistant-speakers"
    after: "67409664b9a0f29e9970ae074ca3ebd612f0fc683374d5c509d14ee4002fc817"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-16-saved-assistant-speakers"
    after: "f872c1fff414d6c513138cc71b8c65d98fdb058f275916c92cee8ce5ce88b68a"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

为已有 saved-assistant 来源增加可选 returnModel 元数据，并增加独立的 saved-assistant-return 上下文来源。已有记录仍可读取。旧读取器忽略新增元数据并将未知来源上下文保留为文字；不改变现有事件判别值和头部版本。恢复模型从已提交的会话日志读取，之后明确的 model/selection 事件优先。

<a id="verification"></a>
## 验证

真实 Agent 循环测试采用由上次请求决定当前模型的实际行为，清空并重新挂载路由状态，检查已记录的恢复模型、连续提及，以及用户后续明确选择的模型优先。

<a id="dev-note"></a>
## 开发备注

无。
