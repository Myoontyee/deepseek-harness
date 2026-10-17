---
description: "助手和讨论退役后的只读历史记录与普通聊天恢复。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-discussion-controller

[English](README.md) | 中文

## 概述

为已退役的常驻助手和侧边讨论区提供兼容支持。已有助手配置、记忆和话题记录仍可读取，原生对话日志保留。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

不再提供常驻助手设置、助手提及和讨论创建。旧讨论会话可通过普通对话列表继续。保留的 `discussions` Remote 方法只读取历史记录，修改方法已移除。

-----

<a id="understand-the-implementation"></a>
## 理解实现

存储域保留原有结构和记录。退役处理从当前会话自身的事件识别之前活跃的助手，追加已有的 `saved-assistant-return` 提示，并恢复记录的普通模型和思考强度；之后明确选择的模型优先。不再选择助手配置，也不注入保存的记忆或讨论提示。

-----

<a id="further-exploration"></a>
## 进一步探索

[GUI 子系统](../../../docs/subsystems/web-client.zh.md)和[会话存储](../../session-query/session-log-export/README.zh.md)说明现有界面与对话读取能力。

-----

<a id="model-experience"></a>
## 模型体验

### 退役上下文

#### 模型看到什么

旧助手调用第一次被接受的后续消息会收到结束该角色的提示。已有对话内容保留为历史上下文，不再添加新的助手职责或记忆。

#### Token 影响

仅在需要时增加一条简短退役提示。读取历史记录不调用模型，也不复制对话历史。

#### KV Cache 影响

保留原有对话前缀；追加的退役提示只影响后续上下文。

## 已知限制与后续工作

历史记录继续保留，但不提供专门的编辑界面，也不自动删除。只读历史 API 仍可用于明确的数据恢复；创建和修改接口已退役。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护说明 — 点击展开</summary>

暂无。

</details>
