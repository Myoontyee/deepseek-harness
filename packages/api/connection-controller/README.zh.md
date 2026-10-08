---
description: "提供 OpenSSH 别名保存、只读连接测试、远程终端和专用远程控制会话。设置页由 `@deepseek-ai/dsh-client-ui-settings-connections` 提供，SSH 预设使用 `remote-tools` 入口。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-connection-controller

[English](README.md) | 中文

## 概述

提供 OpenSSH 别名保存、只读连接测试、远程终端和专用远程控制会话。设置页由 `@deepseek-ai/dsh-client-ui-settings-connections` 提供，SSH 预设使用 `remote-tools` 入口。

## 目录

- [配置](#configuration)
- [操作](#operations)
- [代码来源](#source-reuse)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="configuration"></a>
## 配置

`profiles` 保存显示名称、POSIX 远程目录和 AI 命令授权。`sshExecutable` 指定 OpenSSH，`sshConfigPath` 可指定配置文件。`controlRoot` 留空时在运行中 Host 的 DSH 主目录下解析，不保存构建机器路径。文件数量、字节数、执行时间和输出上限可配置。

别名通过配置文件发现，实际端点由 OpenSSH `-G` 解析。会话绑定在 `ssh_connections` v1 存储域中固定别名、主机、账号、端口和目录，不保存私钥内容或密码。连接必须已有可信主机指纹，不会自动接受新指纹。

<a id="operations"></a>
## 操作

经过认证的 `connections` API 提供列表、偏好、测试及打开会话或终端。稳定请求编号去重并发打开操作并复用会话编号。每次 AI 命令都会核对当前 Agent、绑定目标、当前保存的授权及完全访问权限；撤销授权阻止后续命令。交互终端属于用户，与 AI 工具分开。

`ssh_exec` 只接收命令，不接受模型另选主机或凭据。每次调用运行独立 POSIX shell，通过受管理子进程执行。取消与 Host 退出会结束并等待本地 SSH 进程；超时或断线不能证明远端进程已停止。结果记录有限输出、退出状态、截断与超时，不会回退到本地执行。

<a id="source-reuse"></a>
## 代码来源

别名发现改编自 Yan-Zero/dsh-remote-ssh，见 [来源说明](THIRD_PARTY_NOTICES.md) 与 [Apache-2.0](LICENSES/Apache-2.0.txt)。

<a id="model-experience"></a>
## 模型体验

### 远程目标与命令

#### 模型看到的内容

SSH 会话在持久化上下文中接收名称和目录，只暴露 `ssh_exec`。结果包含有限输出，并在传输中断后标明远端状态未知。

#### Token 影响

目标增加一条简短上下文，命令结果受配置的每个输出流字节上限限制。

#### KV 缓存影响

目标上下文在会话中保持稳定，命令追加普通工具历史，偏好变化不改写先前请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- Agent 在本地 Host 运行，关闭 DSH 不会留下持续运行的远端 Agent。AI 命令要求 POSIX shell，Windows 远端 shell 与设备配对另行实现。别名发现仅用于展示提示，不能代替 OpenSSH 解析；超过读取限制会报告。删除会话后，绑定记录目前仍保留在本地应用数据中。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文 — 点击展开</summary>

无。

</details>
