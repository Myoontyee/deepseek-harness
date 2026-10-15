# 定制应用发布

[English](custom-release.md) | 中文

定制发布工作流从同一个已存在的 `custom-v` 标签构建 Windows x64、macOS ARM64、macOS x64 和 Android 配套客户端。四个平台云端构建成功后创建发布草稿；本机完成 Android 签名后才公开发布，不覆盖已公开的 Release 资源。桌面安装包未签名，macOS 包未公证。仓库目前没有 iOS 客户端，因此不提供 iOS 构建目标。

## 准备发布

将选定的官方 `dsh-v` 发布版合并到定制分支，适配定制功能，并通过对应检查及正常推送钩子。保留官方标签与定制提交历史。基座为预发布版时，对验证后的提交打 `custom-v<基座>.YYYYMMDD.序号` 标签；稳定基座使用 `custom-v<基座>-test.YYYYMMDD.序号`。日期使用北京时间的实际发布日期，序号为 1 至 99。推送标签启动工作流，也可手动选择已有标签重跑。工作流检查标签是否对应当前提交，以及是否包含官方发布版祖先。

Android 显示相同版本号，内部使用递增的 `YYYYMMDDxx` 版本代码。云端不接收签名凭据，仅将未签名 APK 保留为工作流产物及非公开发布草稿附件。在所有者的 Windows 本机设置 `DSH_ANDROID_KEYSTORE`、`DSH_ANDROID_PASSWORD_FILE`、`ANDROID_HOME`、`JAVA_HOME` 和 `DSH_CUSTOM_UPDATE_PRIVATE_KEY` 后，运行 `node .github/scripts/custom-sign-android.mjs <标签> <运行编号>`。脚本核对源码身份、下载校验值及 APK 元数据，使用原有 `dsh-companion` 身份签名、验证 APK，上传签名 APK 和最终校验文件、移除未签名草稿附件后公开发布。可将 `DSH_ANDROID_BASELINE_APK` 设置为旧安装包路径，以核对覆盖升级所需的签名连续性。凭据始终留在本机；更换签名身份将无法覆盖升级。

## 下载与更新

成功的 Release 包含四个安装包、`SHA256SUMS.txt` 和已签名的 `update.json`。失败的构建保留桌面端诊断记录十四天；本机签名完成之前，发布草稿保持非公开。重跑已经发布的标签会失败，不会替换下载文件；源代码变化必须使用新版本号。定制包内置更新验签公钥，以 `custom-updates` Release 作为签名更新入口。Windows 保留既有官方强制更新策略服务地址。Windows 在后台下载通过验证的安装包，并在任务空闲时提示重启安装；未签名 macOS 则下载通过验证的 DMG，引导用户在 Finder 中替换应用。这些安装包不能称为签名的官方版本。


## 定制更新信任机制

云端构建生成包含源码身份和安装包 SHA-256/SHA-512 校验值的 `UPDATE-PAYLOAD.json`。本机完成流程核对成功构建的源码及资源校验值，将 Android 条目替换为本机签名后的 APK，再用 Ed25519 签署最终元数据，移除中间清单。不可变版本公开发布后，才推进 `custom-updates/update.json`。应用内不包含任何私钥或 GitHub 访问令牌。

请在本机备份更新私钥。对应公钥固定在 `apps/desktop/src/custom-update-key.ts`；仅更换私钥无法为现有客户端更新。没有更新渠道的旧安装包需要手动升级一次。下载完成不代表可以中断正在运行的任务：重启安装仍需确认，并提示先保存未发送的草稿。未签名 macOS 不宣称支持系统原生自动替换应用。
