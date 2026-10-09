---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-09-queued-message-edit

[English](2026-10-09-queued-message-edit.md) | 中文

## 概述

在 user-rpc 排队输入上持久化最近消息的编辑范围，使重启后的合法新步骤可以执行 surface 替换。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-09-queued-message-edit
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-08-message-edit"
    after: "9f08f7bfa3ba0375c8c209dd4c815c5ef0722141f7aaadbb22bffc17784a6512"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-08-message-edit"
    after: "83125dc83823b8bbe772ed13a5f39c47424f406f3cd0710c777b2876c1273a74"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-08-message-edit"
    after: "9a4d446f9d59b4bb76454f0a23264d8e7fc67e1a189c5dc647d654382f0b0e69"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-08-message-edit"
    after: "ae6f2b5ea3bdfb9669d97ef4675a939150bc6ef1dcf396b39e0200dfc9d15a70"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

新增可选 edit 属性，缺少此属性的已有记录仍有效。已完成编辑使用未更改的标准 surface 替换。旧控制器保留该可选数据但不会执行待处理的编辑意图，因此不支持仍有排队编辑时降级。已发布的 V4 校验器及记录不变。

<a id="verification"></a>
## 验证

7 项消息编辑测试通过，覆盖压缩日志关闭重开、排队编辑恢复、准入拒绝保留历史和模型输入排除旧内容。旧实现运行相同的冷重开测试会报 developer/message does not match an open turn and step。

<a id="dev-note"></a>
## 开发备注

无。
