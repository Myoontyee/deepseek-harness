---
description: "持久侧边讨论和用户管理的助手模板。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-discussions

[English](README.md) | 中文

## 概述

每个对话都可打开侧边讨论区。选中聊天或文件文字可带着原文创建话题。设置提供保存的助手身份、职责、临时／项目／常驻模板，以及明确的记忆控制。

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

先在设置 → 常驻助手中创建助手。从对话标题栏或划词菜单打开讨论区。话题创建独立原生会话，不复制主对话历史。选择话题可在侧栏继续讨论。关闭标签页仍保留话题和记录。标记解决、归档和重新打开均保留历史。可以将确认后的结论连同讨论链接加入主对话草稿，不会直接发送消息。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护说明 — 点击展开</summary>

`discussionboard` 资源在标签页打开时持有主对话引用。打开的话题额外持有一个会话引用，并复用现有 Conversation 工厂显示。仅挂载正在查看的话题。Host 负责助手记录、话题元数据和记忆条目。设置保存失败会保留编辑文字；版本冲突需要刷新。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[Web 客户端子系统](../../../docs/subsystems/web-client.zh.md)和[讨论存储](../../api/discussion-controller/README.zh.md)。

-----

<a id="model-experience"></a>
## 模型体验

### 讨论上下文

#### 模型看到什么

打开面板或保存助手不会调用模型。话题内发送消息使用原生会话链路及其留痕的 `discussion-assistant` 上下文。确认记忆通过设置管理，不会自动从每次讨论提取。

#### Token 影响

仅发送讨论消息时产生模型请求；引用和选中的完整记忆条目增加上下文长度，记忆字符数受 Host 上限控制。不会复制全部主对话。

#### KV Cache 影响

界面不增加额外模型请求。仅 Host 选中的上下文进入话题后续请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 首版提供手动刷新，每个话题选择一个助手。尚未实现自动记忆提取、多成员调度、话题搜索和未读数量。未保存的话题创建字段暂存在面板中；原生聊天草稿使用现有会话持久化。不启用自动删除历史。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护说明 — 点击展开</summary>

暂无。

</details>
