---
description: "历史助手标签显示与已退役讨论面板清理。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-discussions

[English](README.md) | 中文

## 概述

在常驻助手和侧边讨论功能移除后，为旧助手消息保留兼容显示。

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

定制桌面版不再注册常驻助手设置、@ 候选、讨论按钮、话题面板或划词讨论操作。旧消息保留当时记录的昵称和头像，旧讨论会话可通过普通对话历史访问。

-----

<a id="understand-the-implementation"></a>
## 理解实现

仅注册历史回复身份投影和历史提及标签显示。会话显示时，插件关闭过时的 `discussionboard` 标签，不删除会话或其他标签。这些操作不查询助手列表、模型目录或记忆服务。

-----

<a id="further-exploration"></a>
## 进一步探索

[Web 客户端子系统](../../../docs/subsystems/web-client.zh.md)和[讨论存储](../../api/discussion-controller/README.zh.md)。

-----

<a id="model-experience"></a>
## 模型体验

### 历史显示

#### 模型看到什么

客户端兼容插件不添加模型输入。之前选择过助手时，由宿主负责一次性退役提示。

#### Token 影响

历史标签显示和标签清理不调用模型，也不增加 token。

#### KV Cache 影响

显示层不改变对话内容或模型请求的缓存前缀。

## 已知限制与后续工作

已保存的身份和讨论元数据仍在存储中，可用于恢复。移除后的设置和讨论面板不再提供编辑或删除操作。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护说明 — 点击展开</summary>

暂无。

</details>
