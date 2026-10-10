---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-08-message-edit

[English](2026-10-08-message-edit.md) | 中文

## 概述

新增同一会话消息修订所用的 message-edit 来源元数据。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-08-message-edit
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-02-session-relay"
    after: "19e785c215cffac1b2c9e6fb1ff4465c52e886b6690489e693835618b68fd92e"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-02-session-relay"
    after: "41d3ceaa30671c4ddb9165384e83f3bef6aef4aa159fcf1767d585893755ef56"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-02-session-relay"
    after: "666b5da723d56738f4cc092bf54922774fcfc1bcdb8203d5e3aa02be46989f83"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-02-session-relay"
    after: "6c22f141746bc1cc6004fa54ce02ecdb884dbea9d329228ec82075ef9189b9b2"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有事件记录仍然有效。新来源使用已有的空 developer/message 和标准 surface 替换操作，物理日志保持只追加。旧版聊天客户端可能仍显示被替换的行，但现有 surface 引擎会排除被替换的模型可见内容。

<a id="verification"></a>
## 验证

631 项聊天、消息编辑和完成角标相关测试通过，包括过期、忙碌、压缩目标拒绝及修订回放。

<a id="dev-note"></a>
## 开发备注

无。
