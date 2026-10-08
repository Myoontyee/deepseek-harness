---
description: "`ctx.gitController` 为注册的本地工作区提供经过认证的 `remote.git` 操作。命令通过托管子进程执行，使用独立参数、输出上限和时限。Git 与 GitHub CLI 的可执行文件可以配置。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-git-controller

[English](README.md) | 中文

## 概述

`ctx.gitController` 为注册的本地工作区提供经过认证的 `remote.git` 操作。命令通过托管子进程执行，使用独立参数、输出上限和时限。Git 与 GitHub CLI 的可执行文件可以配置。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将控制器与 `typert`、`workspaceRegistry` 和 `subprocess` 一起挂载。Web 应用包提供控制器和[设置界面](../../client/ui-settings-git/README.zh.md)。仓库状态携带由 HEAD、机器可读状态和暂存区条目生成的版本标识。暂存、取消暂存、提交、切换分支及网络操作拒绝过期版本，并按仓库根目录串行执行。取消暂存保留工作文件；提交不会隐式暂存或修改上一条提交。拉取仅允许快进。没有上游的分支明确发布到 `origin`，不会强制推送。

GitHub 浏览器登录仅提供验证码和固定授权地址，不返回访问令牌。取消流会终止登录命令。创建 PR 使用保存的草稿偏好；合并 PR 指定已审阅的确切提交，并使用保存的合并方式。立即合并被拒绝时不会启用自动合并。偏好通过已有 Host 设置服务保存。

<a id="understand-the-implementation"></a>
## 实现说明

`commands.ts` 管理进程生命周期和完整输出检查。`parse.ts` 解析以 NUL 分隔的状态记录，包括重命名来源路径。`auth.ts` 限制并取消单个 Host 登录尝试。`index.ts` 解析已注册工作区、暴露 Remote 方法并检查操作前的状态。Git 网络操作只在本次调用中追加 GitHub CLI 作为 GitHub 域名的凭据助手，不改写全局 Git 配置；已有凭据助手仍优先，未提供凭据时可使用刚授权的 GitHub 账号。

<a id="further-exploration"></a>
## 延伸阅读

[API Gateway](../../../docs/api-gateway.zh.md)介绍认证传输，[subprocess](../../subprocess/subprocess/README.zh.md)介绍进程约束，[settings](../../settings/settings/README.zh.md)介绍偏好持久化。

<a id="model-experience"></a>
## 模型体验

无，本控制器提供经过认证的 Git 操作，模型上下文由审查消费者负责。

#### KV 缓存影响

界面和调用本身不直接改变模型请求前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- Git 操作使用 Host 本地工作区。未跟踪文件需要先暂存才能预览差异。状态快照不构成针对外部 Git 进程的文件系统事务。操作提交后仍可能发生进程超时，调用方必须刷新后再决定是否重试。GitHub CLI 管理凭据存储；操作系统凭据库不可用时可能回退到配置文件。GitHub 网络操作仍依赖配置的 CLI、凭据助手和网络连接。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文 — 点击展开</summary>

无。

</details>
