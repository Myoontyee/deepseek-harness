---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-10-custom-alpha2-integration

[English](2026-10-10-custom-alpha2-integration.md) | 中文

## 概述

将定制会话互通来源和同会话排队编辑接入官方 alpha.3 持久化历史。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-10-custom-alpha2-integration
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-user-rpc-principal"
    after: "48682fb0438da203bc928c4a8964fa8eee4d54640de78160ed1ee2807c2d9628"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "db570388df700b34e2d7330e2114fb6b67513f64b915e83b104a83a46d0ba2e6"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-user-rpc-principal"
    after: "69207758da6350ec4bc96014d039f17f47c12442e12ff621c95010b71e3573f8"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "2d7a591baca42163e83c4b895d23258ed7bfd3e01537d4f31d503ce4c5b50a49"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

定制元数据仍为可选字段，保留官方 user-rpc 的 principal 来源信息。旧 alpha.2 定制记录缺少 principal 时仍代表所有者。edit 判别字段标识排队修订，接纳后的替换仍使用普通持久化表面替换。不识别定制来源的读取器可能显示审计行，但模型回放必须使用已持久化的替换。本记录不属于已定稿检查点，按官方历史刷新；不改写任何会话代次文件或已定稿模式。

<a id="verification"></a>
## 验证

alpha.3 集成的编辑消息 Host 定向测试通过，Host 和 Client 类型检查通过。实际桌面注释场景通过，包含注释准确传递给模型及完成提醒跨窗口同步。

<a id="dev-note"></a>
## 开发备注

无。
