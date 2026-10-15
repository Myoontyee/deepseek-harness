# 定制应用发布

[English](custom-release.md) | 中文

定制发布工作流从同一个已存在的 `custom-v` 标签构建 Windows x64、macOS ARM64、macOS x64 和 Android 配套客户端。四个平台云端构建成功后创建发布草稿；本机完成 Android 签名后才公开发布，不覆盖已公开的 Release 资源。桌面安装包未签名，macOS 包未公证。仓库目前没有 iOS 客户端，因此不提供 iOS 构建目标。

## 准备发布

将选定的官方 `dsh-v` 发布版合并到定制分支，适配定制功能，并通过对应检查及正常推送钩子。保留官方标签与定制提交历史。基座为预发布版时，对验证后的提交打 `custom-v<基座>.YYYYMMDD.序号` 标签；稳定基座使用 `custom-v<基座>-test.YYYYMMDD.序号`。日期使用北京时间的实际发布日期，序号为 1 至 99。推送标签启动工作流，也可手动选择已有标签重跑。工作流检查标签是否对应当前提交，以及是否包含官方发布版祖先。

Android 显示相同版本号，内部使用递增的 `YYYYMMDDxx` 版本代码。云端不接收签名凭据，仅保留未签名 APK 工作流产物。在所有者的 Windows 本机设置 `DSH_ANDROID_KEYSTORE`、`DSH_ANDROID_PASSWORD_FILE`、`ANDROID_HOME` 和 `JAVA_HOME` 后，运行 `node .github/scripts/custom-sign-android.mjs <标签> <运行编号>`。脚本核对源码身份，使用原有 `dsh-companion` 身份签名、验证 APK，上传签名 APK 和最终校验文件后公开发布草稿。凭据始终留在本机；更换签名身份将无法覆盖升级。

## 下载与更新

成功的 Release 包含四个安装包及 `SHA256SUMS.txt`。失败的构建保留桌面端诊断记录十四天；本机签名完成之前，发布草稿保持非公开。重跑已经发布的标签会失败，不会替换下载文件；源代码变化必须使用新版本号。发布 GitHub Release 不等于配置应用内自动更新；Windows 保留既有官方强制更新策略服务地址，无签名 macOS 构建使用上游本地打包默认配置。这些安装包不能称为签名的官方版本。
