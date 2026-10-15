---
description: "持久讨论元数据与明确保存的助手记忆。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-discussion-controller

[English](README.md) | 中文

## 概述

你可以保留侧边讨论，并为重复使用的助手保存明确确认的记忆。每个话题保留原始引用，不复制主对话记录。关闭面板或关闭记忆读取不会删除已有记录。打开话题不会启动模型执行。

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

Web Bundle 组合此服务。设置管理名称、职责和记忆范围。临时助手不注入跨任务记忆；项目助手只读取当前项目条目；常驻助手还可读取其自身的全局条目。记忆变更必须由用户明确保存。`maxMemoryChars` 限制每次模型请求中完整记忆条目的总字符数，包含分隔符。

| 字段 | 默认值 | 含义 |
|---|---|---|
| maxMemoryChars | 6000 | 每次请求中选中记忆的字符上限，含分隔符；0 表示不注入。 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护说明 — 点击展开</summary>

生成的 `discussions` Remote 负责配置编辑、话题创建和记忆变更。话题通过幂等键创建独立会话，不分叉复制主对话全部历史。助手配置与话题编辑检查版本号。系统上下文通过现有提示词链路留痕。引用原文及主对话记录只是参考材料，不是新指令。不会自动通知或唤醒主对话。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[GUI 子系统](../../../docs/subsystems/web-client.zh.md)和[会话存储](../../session-query/session-log-export/README.zh.md)说明现有界面与对话读取能力。

-----

<a id="model-experience"></a>
## 模型体验

### 讨论上下文

#### 模型看到什么

讨论请求包含助手职责、原始引用、主对话深度链接及有大小上限的用户确认记忆。需要更多主对话文字时，可使用现有 `read_session` 工具。这些接口没有提供自动写入记忆的工具。

#### Token 影响

仅发送讨论消息时产生模型请求；引用和选中的完整记忆条目增加上下文长度，记忆字符数受 Host 上限控制。不会复制全部主对话。

#### KV Cache 影响

修改助手配置或已确认记忆会改变后续上下文内容。单纯保存历史不会调用模型，也不会注入旧对话记录。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 尚未实现自动提取事实、向量索引、后台唤醒或多成员调度。项目记忆使用精确的 Host 工作区标识。话题元数据不自动过期；明确归档仍保留原生会话历史。远程委托需要为新接口明确授予访问策略权限。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护说明 — 点击展开</summary>

暂无。

</details>
