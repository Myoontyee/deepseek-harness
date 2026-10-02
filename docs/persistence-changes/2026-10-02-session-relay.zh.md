---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-02-session-relay

[English](2026-10-02-session-relay.md) | 中文

## 概述

增加普通会话之间带来源的消息与一次自动反馈。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-02-session-relay
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-21-user-question-reply"
    after: "c54d01e01e946a5b3f28fb35268f9724894b3bc4fe8b0ff0935bf771dbebfaf1"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-21-user-question-reply"
    after: "b3f29c52823597e4d1d87960952140aec366f5e27b2fda93972b68205d058b3a"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-21-user-question-reply"
    after: "21c004a397766c06289ad39320956f8f2bd1038f0e2eec943c8b862cef94dbe5"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-21-user-question-reply"
    after: "8e5f6f9da05dba26acc463ed0b05fbad80502281024cc4c5bfed4726158d7948"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

session-relay 扩展 MessageSourceMap，保留既有消息和收件事件封装。原有来源仍然有效；新记录携带发送来源、请求标识、原请求和反馈标志。Host 终止后不会重放自动反馈。

<a id="verification"></a>
## 验证

会话互通测试使用真实 AgentLoop 收件队列，验证并发去重、关闭反馈、归档和未知目标、接受前取消及反馈来源。Desktop 验证采用正式 profile 与本地固定回复提供方。

<a id="dev-note"></a>
## 开发备注

无。
