---
description: "注册项目的 Git 可视化操作及持久化偏好设置"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-git

[English](README.md) | 中文

## 概述

Git 设置页包含注册项目选择、仓库状态、差异、提交历史、暂存、提交、分支操作，以及 GitHub 账号和 PR 控制。界面通过经过认证的 Remote 操作调用 [Git 控制器](../../api/git-controller/README.zh.md)。

## 目录

- [使用本包](#use-this-package)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

打开“设置 → Git”并选择已注册项目。勾选文件与选择差异预览相互独立。暂存或取消暂存勾选的文件，检查已暂存差异后填写说明并提交。新分支使用保存的名称前缀。获取、拉取和推送都是明确的用户操作；发布没有上游的分支时，按钮注明 `origin`。GitHub 面板支持验证码登录、PR 列表和创建，以及显示目标分支、提交标识和合并方式的合并确认。

偏好通过 `configForms` 和 `git-controller` 命名空间保存。操作提示位于应用浮层中，切换页面不会丢失完成反馈。请求使用代次检查，避免旧项目的响应覆盖新状态。颜色使用主题变量。

<a id="further-exploration"></a>
## 延伸阅读

参阅[设置](../ui-settings/README.zh.md)、[槽位](../../../docs/subsystems/slots.zh.md)和 [Git 控制器](../../api/git-controller/README.zh.md)。

<a id="model-experience"></a>
## 模型体验

无，设置页将审查上下文和执行委托给 Host 控制器。

#### KV 缓存影响

界面和调用本身不直接改变模型请求前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 页面列出已注册的本地项目；只有未分组会话不会自动形成项目注册。GitHub 登录需要浏览器和可用的 GitHub CLI。PR 面板不包含持续运行的云端服务或自动发布功能。操作和凭据存储的限制由控制器说明文档定义。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文 — 点击展开</summary>

无。

</details>
