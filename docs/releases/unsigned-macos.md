## 未签名、未公证的 macOS 版本

本版本没有 Apple Developer ID 签名，也未经过 Apple 公证。macOS 可能拦截首次启动；请不要将本版本理解为已获得 Apple 安全认证。

应用仅使用无需证书的 ad-hoc 临时签名检查包内文件完整性，不会获得 Gatekeeper 的自动信任。更新后 macOS 可能再次询问钥匙串访问权限。

需要 **macOS 13 Ventura 或更高版本**：Apple Silicon（M 系列）选择文件名以 `-mac-arm64.dmg` 结尾的安装包，Intel Mac 选择以 `-mac-x64.dmg` 结尾的安装包。

### 首次打开

仅在你信任本仓库和下载文件的前提下继续：

1. 打开 DMG，将 `Nopin.app` 拖入“应用程序”，再尝试启动一次。
2. 若提示开发者无法验证或 Apple 无法检查该 App，关闭提示框，进入“**系统设置 → 隐私与安全性**”。
3. 在“安全性”中找到 Nopin，选择“**仍要打开**”（部分系统先显示“打开”），然后按提示确认并验证身份。

具体界面和放行选项以 [Apple 官方打开指南](https://support.apple.com/zh-cn/guide/mac-help/mh40616/mac)为准。若出现“应用已损坏”或“将损坏你的电脑”，请停止打开并[反馈错误](https://github.com/crazzzzhao/notionpin/issues)，不要提供 Notion token。不要关闭系统安全保护或使用终端命令绕过警告。

附件 `SHA256SUMS.txt` 可检查下载文件是否与发布文件一致，但不能代替签名或公证。连接 Notion 时需要配置你自己的 Integration token 和数据库。

## Unsigned, non-notarized macOS build

This build has no Apple Developer ID signature and has not been notarized by Apple. macOS may block its first launch. It does not carry Apple security approval.

An ad-hoc signature seals the bundled files without a developer certificate; it does not establish Gatekeeper trust. macOS may request Keychain access again after an update.

Requires **macOS 13 Ventura or newer**. Choose the file ending in `-mac-arm64.dmg` for Apple Silicon or `-mac-x64.dmg` for Intel.

### First launch

Continue only if you trust this repository and the downloaded file:

1. Open the DMG, move `Nopin.app` to **Applications**, and try launching it once.
2. If macOS cannot verify the developer or check the app, dismiss the alert and open **System Settings → Privacy & Security**.
3. Under **Security**, find Nopin and choose **Open Anyway**. Confirm the launch and authenticate when requested.

Follow [Apple's official opening guide](https://support.apple.com/guide/mac-help/mh40616/mac) for your macOS version. If the alert says the app **is damaged** or **will damage your computer**, stop and [report the error](https://github.com/crazzzzhao/notionpin/issues) without including your Notion token. Do not disable system security or use terminal commands to bypass warnings.

Use the attached `SHA256SUMS.txt` to compare the download with the published file; a matching checksum is not a signature or notarization. Configure your own Notion integration token and database after opening the app.
