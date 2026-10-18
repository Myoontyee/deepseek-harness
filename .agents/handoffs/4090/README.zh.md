# DeepSeek Harness Desktop：4090 开发交接

[English](README.md) | 中文

这是 2026-10-18（北京时间）的开发交接。改代码前先读仓库 [AGENTS.md](../../../AGENTS.md)。[state.json](state.json) 保存安装包版本、校验值和交付状态。

## 范围

后续开发迁到 4090，降低笔记本负担。用户会在那边自己新开对话；未经授权不要创建或给其他对话发消息。名称固定为 **DeepSeek Harness Desktop**，图标沿用桌面鲸鱼。

用户最新要求已明确覆盖之前的手机范围：安卓登录官方账号后直接进入独立手机聊天，电脑连接是设置中的可选功能。手机记录列表用地球标识已授权电脑上的对话；手机向电脑同步对话与批注副本，电脑端只读预览。常驻助手和侧边讨论区仍移除。保留既有注释草稿、行内编辑、滚动、快捷键、Markdown 链接与公式、密钥脱敏以及官方/定制版独立更新指示。不要擅自关闭必要更新策略或安装包验证。

## 当前安装包

Windows 和安卓均为 **0.2.1-rc.2.20261018.3**，官方底座为 **dsh-v0.2.1-rc.2**。安装包位于笔记本 `D:/DeepseekHarness/SetupBackage`。安卓 ARM64 适用于用户的 vivo，签名与旧版一致，可覆盖安装。

安卓在官方 DeepSeek 登录后直接进入手机聊天；仅在可选连接管理或访问已授权远程设备时启动内置 Tailscale。首次需要在官方浏览器单独授权；不能读取另一个安卓应用的私有登录凭据。之后自动列出账号可见设备。选择配套新版电脑后，在电脑上批准连接，无需扫码或输入 IP；电脑和客户端须保持运行，扫码仍是备用入口。

## 在 4090 开始

使用 `Myoontyee/deepseek-harness` 的 `codex/android-tailnet-20261018` 分支，不要直接假设默认分支包含本次改动。笔记本仓库为 `D:/DeepseekHarness/raw/deepseek-harness`，本地分支 `custom/content-only-copy`。更新 4090 上已有 checkout 前先保护未提交修改。

尚未完成远程复制：Tailscale 返回 `4090-server` 节点密钥过期，SSH 在认证前关闭。须先在该机重新登录；其 checkout 路径与工具链尚未核查。不能声称已复制到 4090。此交接已提交仓库，拉取交付分支后即可读取。

## 本地安卓构建

用户后来明确授权补齐本地工具，改为本机打包。Go 1.27.1、Android NDK 28.2.13676358 已装到 `D:/DeepseekHarness/tools/android`，复用原有 JDK 17、SDK 35、Build Tools 35.0.0、Gradle 8.11.1。Go 模块、编译缓存和 Gradle 依赖均在该目录保存。

使用 [build-local.ps1](../../../apps/android/scripts/build-local.ps1)，参数见[安卓说明](../../../apps/android/README.zh.md)。传入本地签名库和密码文件路径；`-ProxyUrl` 指定代理，空字符串表示直连，默认是笔记本的 17897 端口。不要假设 4090 已有同样的目录或代理。脚本最多使用八个逻辑处理器和两个工作任务。

签名私钥和密码留在笔记本，禁止写入 GitHub Secrets、源码、Release、交接文档或随代码传到 4090。公开证书指纹见 `state.json`。生成的原生库与许可文件已由 Git 忽略，Go 依赖校验文件提交仓库；APK 内带有 AndroidX、Go 和原生依赖许可。

Windows 的笔记本离线适配和缓存不在受版本管理的源码内，不要照搬其中绝对路径到 4090。标准入口是 [package-target.ts](../../../apps/desktop/scripts/package-target.ts)。本次最终续包复用了已准备运行时，并采用现有有限并行文件清单算法，保留全部校验。打包中不要修改应用源码或提交。

## 验证

当前检查覆盖原生 Go、六项模型协议、浏览器批注/Markdown/远程对话，以及安卓模拟器中的节点启动、数据库持久化和免配对聊天首页。设置按钮的无障碍定位在首次模拟器运行后修正，最新完整运行状态见 state.json。本地 ARM64 使用锁定 Go/NDK 编译，网络适配、PKCE 拒绝用例、APK 签名与原证书、架构/名称/版本、ELF 16KB 对齐均通过。真实手机登录及完整跨设备连接仍需用户实机验证。

电脑端八项授权/传输测试通过；另用本机真实 Tailscale 身份和私网地址完成隔离授权及撤销实测。Windows 编译和打包成品运行时检查通过，已检查实际打包主程序含新的发现和身份验证逻辑。这不等于原有全量 UI 测试全部通过。

## 当前本地修改

当前代码增加手机模型及思考强度选择、流式 Messages 请求、按账号压缩保存对话与草稿、Markdown/TeX 批注及可选记录副本同步。免扫码授权取消可释放旧请求；服务探测区分 DSH 可连接与 Tailscale 在线。远程操作页移除顶部工具栏，对话行显示地球图标，不再把无关资源请求失败误报为电脑授权失效。构建和交付核验结果已写入 state.json。

## 实现边界

安卓应用权限不能直接用 Go netlink 枚举网卡。[TailnetClient.java](../../../apps/android/app/src/main/java/io/jadegate/dsh/companion/TailnetClient.java) 把 SDK 可见网卡提供给[原生组件](../../../apps/android/tailnet/main.go)。Android+cgo 不注册 androidbin fallback，单独 import 无效。保留 cgo/bionic 域名解析，不要加 netgo 构建标签。

[电脑引导连接](../../../apps/desktop/src/tailnet-pairing.ts) 仅绑定本机 Tailscale IPv4 的 42873 端口，先由本机 daemon 核验真实来源，再让用户批准。不能信任转发头或对方自报名称。每台手机授权独立、可撤销，Host Cookie 留电脑；已启用的 LAN 网关切到 Tailscale 时，需要批准后停止并重新绑定。

下一轮优先验证手机真实登录、设备选择、拒绝/撤销、多电脑切换、Wi-Fi/蜂窝/VPN 切换、前后台恢复、长注释草稿。不要把检测到 100.x 地址冒充设备发现。全平台发布和未来上游升级是后续独立工作。Electron 测试使用隔离资料目录，关闭测试账号的设备发现，并恢复用户的协议关联。
