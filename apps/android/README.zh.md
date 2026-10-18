# DeepSeek Harness Desktop for Android

[English](README.md) | 中文

用于桌面版“手机控制”入口的个人安卓版。这不是 DeepSeek 官方安卓客户端。电脑和 DSH 必须保持运行。需要 Android 8.0 或更高版本，建议更新 Android System WebView。

启动图标复用桌面端鲸鱼标识，并提供安卓自适应和圆形图标资源。

## 连接

1. 首先在系统浏览器登录 DeepSeek。应用使用官方 Platform PKCE 授权流程，密码只输入官方页面。手机不运行独立聊天模型。升级 APK 会保留已有电脑授权，但重新打开前需要先登录账号。
2. 首页启动内置 Tailscale 节点并恢复应用自身保存的登录。首次使用点击“登录 Tailscale”，在官方浏览器页面完成授权。它是独立于已安装 Tailscale VPN 应用的节点，不读取其他应用的登录凭据。设备列表自动展示该账号可见的节点、Tailscale 名称和在线状态。
3. 点击运行配套新版桌面端的电脑，在电脑本地确认连接，无需扫码或输入地址。桌面端仅在 Tailscale IPv4 地址监听引导连接，先由本机 Tailscale 核验来访节点，再经本地确认返回设备授权。关闭手机控制也会关闭自动发现。二维码保留为局域网连接的备用入口。
4. 打开同一套 DSH 对话和文件。长按文字选择“添加注释”，或使用工具栏的批注按钮。沿用 DSH 注释编辑器，保留选中文本引用并单独记录备注。已接受的任务由电脑执行。
5. 各台电脑的授权分别保存，切换已授权电脑无需再次确认。设置中可开启对已保存、证书固定的电脑自动重连。网络恢复后只重试失败页面，不会刷新正在写备注的正常页面。电脑面板撤销设备会立即终止访问；手机清除凭据不会撤销离线电脑上的授权。

## 身份验证与保存

配对码包含私有网络地址、SHA-256 证书标识和随机一次性密钥。内置引导连接通过已认证的 Tailscale 网络交换身份资料；后续原生配对与 WebView 请求必须匹配该证书并通过有效期检查；电脑身份改变后需要重新配对。不存在通用证书错误放行，也不提供 JavaScript 调用原生功能的桥接接口。内置页面只访问已配对来源；用户主动点击的外部链接可以在系统浏览器打开，不携带 DSH 设备 Cookie。

桌面版通过 Electron 的系统加密保存 TLS 私钥及每台设备的授权摘要，DSH Host 内部凭据只留在电脑。安卓版通过不同的 Android Keystore AES-GCM 存储空间分别保存官方账号授权和电脑连接授权，内置 Tailscale 节点状态保存在应用私有目录。应用关闭备份，使用 Secure/HttpOnly 设备 Cookie。配对必须由电脑本地批准。此授权允许完整的已认证 DSH 操作界面，包括查看对话、发送和停止任务、处理权限确认，并非只读授权。最多配对八台设备。

## 构建

使用 JDK 17、Android SDK 35、Build Tools 35.0.0、Gradle 8.11.1、Go 1.27.1 和 Android NDK 28.2.13676358。在不提交的 `local.properties` 中配置 SDK。按锁定的 Tailscale 依赖为 Android 编译 `tailnet/`，将组件放入 `app/src/main/jniLibs/<abi>/libdsh_tailnet.so`；专用 Actions 工作流也会编译组件并打包第三方声明。设置 `DSH_ANDROID_KEYSTORE` 和 `DSH_ANDROID_STORE_PASSWORD`，指定私有且长期保存的签名库，别名为 `dsh-companion`，再运行 `gradle :app:assembleRelease`。禁止提交密钥或密码。后续升级应使用同一签名密钥。分发前运行 `apksigner verify` 验证 APK。 未设置 `DSH_ANDROID_KEYSTORE` 时，发布任务生成未签名 APK，不配置签名身份。`DSH_ANDROID_VERSION_NAME` 和 `DSH_ANDROID_VERSION_CODE` 分别指定显示版本号及递增的 Android 版本代码。

在 Windows 本机运行 `pwsh -File apps/android/scripts/build-local.ps1 -ToolsRoot <工具缓存目录> -OutputRoot <安装包目录> -KeyStore <私有签名库> -PasswordFile <私有密码文件>`。脚本编译 ARM64，复用 Go 和 Gradle 缓存，验证网络适配、本地签名及原安装证书。`-Unsigned` 跳过签名；后续版本使用 `-Version` 和更大的 `-VersionCode`。生成的原生组件与许可资源由 Git 忽略。工具目录默认指向当前用户的本机安卓缓存，其他机器须准备同样布局或传入自己的目录；下载代理默认使用本机 17897 端口，可通过 `-ProxyUrl` 修改或传入空字符串直连。

## 验证与限制

原生组件和 APK 可以在本机或 GitHub Actions 编译，签名使用原有本地私钥。构建验证包含 Android 模拟器中的真实应用权限启动、获取官方 Tailscale 登录地址以及首页应用名称检查；这些检查不完成真实用户登录，也不等于手机实机验收。PKCE 测试拒绝错误 state、来源、路径及重复回调参数，原生批注动作在打包后的桌面界面验证。尚未在用户安卓真机上验证完整连接。电脑端网络检查覆盖一次性及过期配对、来源验证、凭据隔离、授权持久化、WebSocket 往返和 HTTP/WebSocket 活动连接撤销。浏览器整体验证与安卓实机验证是不同的验证范围。

当前没有后台推送、手机语音输入、屏幕和鼠标远程桌面、网络唤醒、公网中继或持久化远端 SSH Agent。关闭手机不会主动停止已接受任务，退出 DSH 则停止访问。程序不会自动阻止电脑休眠。电脑所选网络地址变化后，需要选择新地址并重新配对。页面摄像头和麦克风请求会被拒绝，文件选择器仍需实机验证。

配对页通过 ZXing Android Embedded 支持扫码。相机权限仅用于原生扫描器，WebView 的相机和麦克风请求仍被拒绝。扫描只填入配对码，仍须主动连接并在电脑确认授权。
