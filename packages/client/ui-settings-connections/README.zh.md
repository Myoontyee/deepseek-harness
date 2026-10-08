---
description: "提供已保存 OpenSSH 服务器的连接设置，展示别名、保存名称与 POSIX 目录、测试认证，并打开远程终端或专用 SSH 会话。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-connections

[English](README.md) | 中文

## 概述

提供已保存 OpenSSH 服务器的连接设置，展示别名、保存名称与 POSIX 目录、测试认证，并打开远程终端或专用 SSH 会话。

## 目录

- [组合](#composition)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="composition"></a>
## 组合

依赖经过认证的 `connections` 远程接口、设置表单、本地化、会话导航和终端侧栏。设置通过框架管理的订阅更新，待打开的终端在所属会话界面挂载后显示。本页不收集私钥或密码。

<a id="model-experience"></a>
## 模型体验

无，连接控制器与 SSH 预设负责模型上下文和命令执行。

#### KV 缓存影响

界面和调用本身不直接改变模型请求前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 新的主机别名需先写入 OpenSSH 配置。AI 命令需要显式保存授权并要求 POSIX shell。会话在本地运行；设备配对和持续运行的远端 Agent 是独立能力。测试结果表示上一次检测，不是持续在线状态。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文 — 点击展开</summary>

无。

</details>
