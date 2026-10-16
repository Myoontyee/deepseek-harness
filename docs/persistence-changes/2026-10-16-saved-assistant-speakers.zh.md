---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-16-saved-assistant-speakers

[English](2026-10-16-saved-assistant-speakers.md) | 中文

## 概述

通过专用用户上下文来源记录常驻助手回复身份。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-16-saved-assistant-speakers
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-10-custom-alpha2-integration"
    after: "00616e6b51b251a1e2dea776079144900566b9f0401e3930e848ffc77e417b42"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-10-custom-alpha2-integration"
    after: "21420126d5a1353f727177d72771afb9144c09ad6507d7d0f47cbac09c2eadea"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-10-custom-alpha2-integration"
    after: "6c74a4b585cc29f4c24057eadc65808a42997ea4b104fb7c3b20de6fd45ad144"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-10-custom-alpha2-integration"
    after: "d8cbc3e308754eabb8dd3c01fbcdc8095377aae1f3b6a70999bbcb3f7816a259"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

saved-assistant 是现有 user/message 信封中的新增来源判别值。新读取器保持兼容旧消息；旧读取器保留未知来源的上下文及其模型可见文字，不会误读身份元数据。助手存储中的提供商、模型和头像偏好为可选字段，旧配置仍可读取。头像元数据不作为模型图片内容。现有会话事件判别值和头部版本保持不变。

<a id="verification"></a>
## 验证

助手专项测试 18 项通过，包含真实 Agent 循环验证模型路由、前文上下文、确认记忆输入及恢复普通模型。客户端类型编译通过。

<a id="dev-note"></a>
## 开发备注

无。
