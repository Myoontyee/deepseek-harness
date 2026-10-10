---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-10-custom-alpha2-integration

[English](2026-10-10-custom-alpha2-integration.md) | 中文

## 概述

将普通会话消息归因及同会话排队编辑整合到官方 alpha.2 持久化历史上。

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
    previous: "2026-10-05-working-directory-attribution"
    after: "e445af34ea6ca9b80f031c1f53351db9295f98c0d7dd8204fc14d4f8ed9aaf6f"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "ec815e4603d44195802820df434f499c777f88b4c66ca65d4f53a6ddefb79758"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-07-title-reasoning-effort"
    after: "f3449ee7306ee3d3c5d5af935b2db922516c499ec7b1a6bc20342b6a1637aae7"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "578be6c12e868f1beb6f427b61b1a7b9146d2626f040267c478a2bdbeff6f5fc"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

官方已接受的记录和已发布的 V4 读取器保持不变。此前三份定制 alpha.1 声明及完整 schema 快照按原始字节保存在 custom-alpha1 下，作为分支历史。此后继记录覆盖官方工作目录归因更新后的合并类型。已有消息来源及没有可选 edit 字段的记录仍可读取。session-relay 元数据是消息归因，不是回放指令。可选 user-rpc 编辑范围在下一合法开放步骤内应用，物理日志历史保留。旧控制器不会执行排队编辑意图，因此不支持带着待处理编辑降级。本次文档整合不重写用户会话文件。

<a id="verification"></a>
## 验证

在 alpha.2 整合版本上，edit-message.host.spec.ts 通过已完成和排队编辑的压缩日志关闭重开、拒绝接纳测试；session-relay.host.spec.ts 通过消息投递、单次反馈和防止反馈回弹测试。七组针对性测试通过 298 项，另有一项平台跳过。

<a id="dev-note"></a>
## 开发备注

无。
