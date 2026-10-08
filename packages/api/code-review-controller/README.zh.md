---
description: "根据工作区、分支或已检出 PR 的改动创建独立只读代码审查会话。每个工作区可保存审查模型与要求，不改变普通聊天的默认模型。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-code-review-controller

[English](README.md) | 中文

## 概述

根据工作区、分支或已检出 PR 的改动创建独立只读代码审查会话。每个工作区可保存审查模型与要求，不改变普通聊天的默认模型。

## 目录

- [准备与持久化](#preparation-and-persistence)
- [配置](#configuration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="preparation-and-persistence"></a>
## 准备与持久化

Git 控制器获取有限差异、改动路径和提交编号。分支及 PR 比较要求干净工作区，PR 的最新提交必须与本地检出提交相同。`code_review` v1 存储域保存准备好的上下文与请求摘要；稳定请求编号可去重并发调用，并在重启后复用已接收的会话。不同输入不能复用同一编号。

会话使用 `code-review` 预设、只读权限和独立模型选择。简短用户消息描述任务，完整代码差异进入持久化动态上下文。接收前取消会停止准备；接收后运行属于会话，使用普通停止控制。Host 退出先取消并等待准备操作，再关闭存储。

<a id="configuration"></a>
## 配置

Git 设置页可修改模型提供方、模型、审查说明与项目偏好。提供方和模型同时留空时沿用普通默认路由。`maxDiffChars`、`maxFiles`、`contextOrder` 控制上下文大小及顺序，截断会明确告知审查模型。

<a id="model-experience"></a>
## 模型体验

### 审查输入

#### 模型看到的内容

模型通过持久化的 `code-review-changes` 上下文接收简短任务与捕获的代码差异。`code-review` 预设只允许读取和搜索，要求给出位置、依据与核查范围。

#### Token 影响

初始差异受 `maxDiffChars` 和 `maxFiles` 限制，后续读取进入普通工具历史。

#### KV 缓存影响

本次审查已准备的差异保持固定，后续轮次可复用不变的前缀，选择审查模型不改变其他会话。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 尚未实现自动监控 PR 和远端常驻审查。审查期间本地文件可能变化，模型需报告不一致。删除会话后，准备记录目前仍留在本地应用数据中。固定回复模型测试验证传输、持久化和工具限制，不代表真实模型的审查质量。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文 — 点击展开</summary>

无。

</details>
