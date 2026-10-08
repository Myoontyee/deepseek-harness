---
description: "按预设将 Agent 的继承工具限制到明确的允许列表。代码审查预设允许读取和搜索；SSH 预设使用相同策略，只允许 `ssh_exec`。"
kind: "package-reference"
---

# @deepseek-ai/dsh-review-policy

[English](README.md) | 中文

## 概述

按预设将 Agent 的继承工具限制到明确的允许列表。代码审查预设允许读取和搜索；SSH 预设使用相同策略，只允许 `ssh_exec`。

## 目录

- [配置与生命周期](#configuration-and-lifecycle)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="configuration-and-lifecycle"></a>
## 配置与生命周期

`preset` 指定预设编号，`tools` 列出允许继承的工具名称。限制在 Agent 创建后安装，预设切换时更新，Agent 或插件退出时清除。在 Agent 作用域安装可以保留该 Agent 从预设继承的工具，同时过滤环境中的其他工具。

<a id="model-experience"></a>
## 模型体验

### 预设工具可见性

#### 模型看到的内容

模型只看到允许继承的工具：审查使用 `read`、`grep`、`glob`，SSH 使用 `ssh_exec`。策略本身不增加提示词。

#### Token 影响

移除工具会从每次请求中移除相应说明与参数声明。

#### KV 缓存影响

改变允许列表会改变工具前缀，不变的列表在后续轮次保持稳定。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 本策略不限制随后直接注册在 Agent 自身作用域内的工具。SSH 授权与文件只读行为仍由执行器校验。本插件不是操作系统沙箱。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文 — 点击展开</summary>

无。

</details>
