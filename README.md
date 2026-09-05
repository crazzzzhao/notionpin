# Nopin

<img src="notion-pin/electron-app/build/icon.png" alt="Nopin logo" width="128" height="128" />

[English](#english) | [中文](#中文)

Keep your Notion tasks within reach. Nopin is a free, open-source macOS app that lets you view and edit tasks in a small, always-on-top window.

> Nopin is an independent open-source project and is not affiliated with or endorsed by Notion Labs, Inc.

## English

### Features

- Always-on-top, collapsible task window
- Notion database connection with explicit field mapping
- Task filtering by status
- Inline title, status, and due-date editing
- Local token storage through the operating system's secure storage
- Refresh tasks or open their pages in Notion from the window

### Download

Open the repository's [Releases](https://github.com/crazzzzhao/notionpin/releases) page and download the DMG for your Mac:

- `mac-arm64`: Apple Silicon Macs (M-series chips)
- `mac-x64`: Intel Macs

Both builds require macOS 13 Ventura or newer. You do not need Node.js or development tools to use the app.

> These downloads have no Apple Developer ID signature and have not been notarized by Apple. macOS may block the first launch.

#### First launch on macOS

Only continue if you trust this repository and the downloaded file.

1. Open the DMG and drag `Nopin.app` into **Applications**.
2. Open Nopin from **Applications** once. If macOS blocks it because the developer cannot be verified or Apple cannot check it, dismiss the alert.
3. Go to **System Settings → Privacy & Security**, scroll to **Security**, and find the blocked Nopin entry. Choose **Open Anyway** (the label can vary by macOS version).
4. Confirm **Open** and authenticate if prompted.

If the approval option is missing, try opening Nopin again. On a managed Mac, contact your administrator. See [Apple's official opening instructions](https://support.apple.com/guide/mac-help/mh40617/mac).

If the alert says the app **is damaged** or **will damage your computer**, do not assume it is an unsigned-app warning. Stop and [report the exact message](https://github.com/crazzzzhao/notionpin/issues), without including your Notion token. See [Apple's explanation of security alerts](https://support.apple.com/en-us/102445).

The release includes `SHA256SUMS.txt` to check that a download matches the published file; a matching checksum is not an Apple signature or notarization.

### Connect a Notion database

1. Create a Notion internal integration and copy its token.
2. Share the target database with that integration.
3. Open Nopin settings and enter the integration token and database URL.
4. Select the database properties used for task title, status, and due date.

The integration needs read access to display tasks and update access to edit them. Use a dedicated integration with access only to the database you intend to expose.

### Privacy and security

- Your token is encrypted locally using macOS secure storage. It is not bundled with the app or included in the repository.
- Requests go directly to the Notion API, without a Nopin account or intermediary server.
- The application contains no analytics or telemetry.
- Do not include tokens in screenshots, issues, or shared configuration files.

### Usage notes

- macOS 13 Ventura or newer only
- Unsigned and not notarized; macOS may block the first launch, and manual approval is not guaranteed to resolve every launch error
- macOS may request Keychain access again after an update because these builds have no Developer ID identity
- Each refresh loads at most 500 tasks; due dates are edited as calendar dates without a time
- New versions are available through GitHub Releases; there is no built-in automatic updater

For setup and build commands, see the [development guide](notion-pin/electron-app/README.md).

## 中文

Nopin 是一款免费、开源的 macOS Notion 任务应用。将任务放在始终置顶的小窗口中，工作时随时查看，也能直接修改任务，无需来回切换页面。

### 功能

- 置顶、可展开/收起的任务窗口
- Notion 数据库连接与字段映射
- 按状态筛选任务
- 直接编辑标题、状态和截止日期
- 使用 macOS 安全存储保存 token
- 在窗口中刷新任务，或打开任务对应的 Notion 页面

### 下载与安装

前往 [GitHub Releases](https://github.com/crazzzzhao/notionpin/releases) 下载对应版本：

- `mac-arm64`：Apple Silicon（M 系列芯片）
- `mac-x64`：Intel Mac

两个版本都需要 macOS 13 Ventura 或更高版本。使用安装包不需要安装 Node.js 或其他开发工具。

> 当前安装包没有 Apple Developer ID 签名，也未经过 Apple 公证，首次打开可能被 macOS 拦截。

#### 首次打开

仅在你信任本仓库和下载文件的前提下继续。

1. 打开 DMG，将 `Nopin.app` 拖入“**应用程序**”。
2. 从“应用程序”尝试打开 Nopin 一次。如果出现“无法验证开发者”或“Apple 无法检查此 App”的提示，先关闭提示框。
3. 前往“**系统设置 → 隐私与安全性**”，向下找到“安全性”中的 Nopin 拦截记录，选择“**仍要打开**”（部分系统会先显示“打开”）。
4. 按提示再次确认打开；需要时使用 Mac 登录密码或系统要求的方式验证。

如果没有看到放行选项，重新尝试打开 Nopin 一次。公司或学校管理的 Mac 请联系管理员。参见 [Apple 官方打开说明](https://support.apple.com/zh-cn/guide/mac-help/mh40617/mac)。

如果提示“**应用已损坏**”或“**将损坏你的电脑**”，不要将它直接当成未签名提示。请停止打开，并[反馈完整错误信息](https://github.com/crazzzzhao/notionpin/issues)，不要附上 Notion token。不同提示的含义见 [Apple 官方安全说明](https://support.apple.com/zh-cn/102445)。

Release 附带 `SHA256SUMS.txt`，用于确认下载文件与发布文件一致；校验和不能代替 Apple 签名或公证。

### 连接 Notion

1. 创建 Notion Internal Integration 并复制 token。
2. 将目标数据库共享给该 Integration。
3. 在 Nopin 设置中填入 token 和数据库链接。
4. 选择任务标题、状态和截止日期对应的 Notion 字段。

查看任务需要读取权限，编辑任务需要更新权限。建议为 Nopin 创建专用 Integration，只授予它所需的数据库访问权限。

### 隐私与安全

- Token 使用 macOS 安全存储在本机加密保存，不会随安装包或仓库发布。
- 应用直接连接 Notion API，不需要 Nopin 账号，也不经过中间服务器。
- 应用不包含分析或遥测。
- 请勿在截图、Issue 或共享的配置文件中包含 token。

### 使用说明

- 目前仅支持 macOS 13 Ventura 或更高版本。
- 未签名、未公证，首次启动可能被拦截；手动允许不能保证解决所有启动错误。
- 因为没有 Developer ID 身份，更新后 macOS 可能再次询问钥匙串访问权限。
- 每次刷新最多读取 500 条任务；截止日期仅按日期编辑，不包含具体时间。
- 暂无自动更新，新版本需要从 GitHub Releases 下载。

需要运行源码或构建安装包，请参阅[开发说明](notion-pin/electron-app/README.md)。

## License

[MIT](LICENSE)
