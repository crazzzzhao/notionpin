# Nopin

![Nopin logo](notion-pin/electron-app/build/icon.png)

[English](#english) | [中文](#中文)

Nopin is a small, always-on-top macOS window for viewing and editing tasks stored in a Notion database. It is free and open source, has no account server, and connects directly from the desktop app to the Notion API.

> Nopin is an independent open-source project and is not affiliated with or endorsed by Notion Labs, Inc.

The app was previously named NotionPin. The GitHub repository URL remains unchanged.

## English

### Features

- Always-on-top, collapsible task window
- Notion database connection with explicit field mapping
- Task filtering by status
- Inline title, status, and due-date editing
- Local token storage through the operating system's secure storage
- No billing, subscriptions, analytics, telemetry, or hosted backend

### Download

Open the repository's [Releases](https://github.com/crazzzzhao/notionpin/releases) page and download the DMG for your Mac:

- `mac-arm64`: Apple Silicon Macs (M-series chips)
- `mac-x64`: Intel Macs

Both builds require macOS 13 Ventura or newer.

> **Unsigned and not notarized:** These builds have no Apple Developer ID signature and have not been notarized by Apple. macOS may block the first launch. This project does not claim Apple security approval.

The app uses an ad-hoc signature to seal its bundled files. This needs no developer certificate and does not make the app trusted by Gatekeeper.

#### First launch on macOS

Only continue if you trust this repository and the downloaded file.

1. Open the DMG and drag `Nopin.app` into **Applications**.
2. Open Nopin from **Applications** once. If macOS blocks it because the developer cannot be verified or Apple cannot check it, dismiss the alert.
3. Go to **System Settings → Privacy & Security**, scroll to **Security**, and find the blocked Nopin entry. Choose **Open Anyway** (the label can vary by macOS version).
4. Confirm **Open** and authenticate if prompted.

Apple's guide notes that the approval option is available for about one hour after an opening attempt. If the option is missing, try opening Nopin once more; on a managed Mac, contact your administrator. See [Apple's official guide for opening an app from an unknown developer](https://support.apple.com/guide/mac-help/mh40616/mac).

These steps apply to an unverified-developer warning, not an alert that the app **is damaged** or **will damage your computer**. For those alerts, stop and [report the exact message](https://github.com/crazzzzhao/notionpin/issues), without sharing your Notion token. Do not disable Gatekeeper, remove quarantine attributes, or change security settings system-wide. See [Apple's explanation of the different security alerts](https://support.apple.com/en-us/102445).

The release includes `SHA256SUMS.txt` to check that a download matches the published file; a matching checksum is not an Apple signature or notarization.

### Connect a Notion database

1. Create a Notion internal integration and copy its token.
2. Share the target database with that integration.
3. Open Nopin settings and enter the integration token and database URL.
4. Select the database properties used for task title, status, and due date.

The integration needs read access to display tasks and update access to edit them. Use a dedicated integration with access only to the database you intend to expose.

### Privacy and security

- The token is stored outside the repository in the current macOS user's application-data directory.
- Nopin refuses to save a token when macOS secure storage is unavailable.
- The renderer never receives the saved token in plaintext.
- Requests go directly to Notion; Nopin has no intermediary server.
- The application contains no analytics or telemetry.
- External links are limited to secure Notion domains.

On first launch, Nopin imports an existing NotionPin configuration (or the older `electron-app` configuration) locally, only if no Nopin configuration exists. Encrypted credentials, database settings, and window preferences are preserved; the source configuration is kept.

Never commit a Notion token. If a token is accidentally published, revoke it in Notion immediately and create a replacement.

### Development

Requirements:

- macOS 13 Ventura or newer
- Node.js 22.12 or newer
- npm 11 or newer

```bash
git clone https://github.com/crazzzzhao/notionpin.git
cd notionpin/notion-pin/electron-app
npm ci
npm run dev
```

Quality checks:

```bash
npm run check
npm audit
```

Build both macOS architectures:

```bash
npm run build:mac
```

Build one architecture:

```bash
npm run build:mac:arm64
npm run build:mac:x64
```

The editable app-icon source is `notion-pin/electron-app/build/icon.svg`. After `npm ci`, regenerate the PNG and multi-resolution ICNS files on macOS with:

```bash
npm run icon:mac
```

The generator uses Electron's Chromium renderer to preserve SVG filters, then macOS tools to create the multi-resolution ICNS.

Build output is written to `notion-pin/electron-app/dist/` and is intentionally ignored by Git.

### Releases

CI checks pushes and pull requests. A tag matching the package version, such as `v1.0.0`, triggers the release workflow, which builds separate arm64 and x64 DMGs and publishes SHA-256 checksums. Maintainers should review local changes and update `package.json` before creating a release tag.

While these builds are unsigned, release titles include `Unsigned / 未签名`, and the workflow includes the bilingual [unsigned macOS release notes](docs/releases/unsigned-macos.md) with the first-launch instructions. Packaging steps do not upload files themselves; the final Release step uploads the assets and publishes the notes together.

The first release does not implement automatic updates. Users download later versions from GitHub Releases.

### Known limitations

- macOS 13 Ventura or newer only
- Unsigned and not notarized; macOS may block the first launch, and manual approval is not guaranteed to resolve every launch error
- macOS may request Keychain access again after an update because these builds have no Developer ID identity
- Each refresh loads at most 500 tasks; due dates are edited as calendar dates without a time
- Intel artifacts can be built automatically, but maintainers should test important releases on real Intel hardware when available

## 中文

Nopin 是一个轻量、始终置顶的 macOS Notion 任务窗口，可直接查看和编辑 Notion 数据库中的任务。它完全免费并开源，没有自建账号服务器，应用会直接连接 Notion API。

应用原名为 NotionPin，GitHub 仓库地址保持不变。

### 功能

- 置顶、可展开/收起的任务窗口
- Notion 数据库连接与字段映射
- 按状态筛选任务
- 直接编辑标题、状态和截止日期
- 使用 macOS 安全存储保存 token
- 无付费、无订阅、无分析、无遥测、无自建后端

### 下载与安装

前往 [GitHub Releases](https://github.com/crazzzzhao/notionpin/releases) 下载对应版本：

- `mac-arm64`：Apple Silicon（M 系列芯片）
- `mac-x64`：Intel Mac

两个版本都需要 macOS 13 Ventura 或更高版本。

> **未签名、未公证：** 本版本没有 Apple Developer ID 签名，也未经过 Apple 公证。macOS 可能拦截首次启动；这不代表应用获得了 Apple 的安全认证。

应用使用不需要开发者证书的 ad-hoc 临时签名封装文件完整性；它不等同于 Developer ID 签名，也不会让 Gatekeeper 自动信任应用。

#### 首次打开

仅在你信任本仓库和下载文件的前提下继续。

1. 打开 DMG，将 `Nopin.app` 拖入“**应用程序**”。
2. 从“应用程序”尝试打开 Nopin 一次。如果出现“无法验证开发者”或“Apple 无法检查此 App”的提示，先关闭提示框。
3. 前往“**系统设置 → 隐私与安全性**”，向下找到“安全性”中的 Nopin 拦截记录，选择“**仍要打开**”（部分系统会先显示“打开”）。
4. 按提示再次确认打开；需要时使用 Mac 登录密码或系统要求的方式验证。

Apple 说明，此放行选项通常在尝试打开 App 后一小时内可用。若没有显示，可重新尝试打开 Nopin 一次；公司或学校管理的 Mac 请联系管理员。参见 [Apple 官方：打开来自未知开发者的 Mac App](https://support.apple.com/zh-cn/guide/mac-help/mh40616/mac)。

以上步骤只针对“开发者无法验证”一类提示。如果显示“**应用已损坏**”或“**将损坏你的电脑**”，请停止打开，并[反馈完整错误提示](https://github.com/crazzzzhao/notionpin/issues)，不要附上 Notion token。不要关闭 Gatekeeper、移除隔离属性，或在系统范围降低安全设置。不同提示的含义见 [Apple 官方安全说明](https://support.apple.com/zh-cn/102445)。

Release 附带 `SHA256SUMS.txt`，用于确认下载文件与发布文件一致；校验和不能代替 Apple 签名或公证。

### 连接 Notion

1. 创建 Notion Internal Integration 并复制 token。
2. 将目标数据库共享给该 Integration。
3. 在 Nopin 设置中填入 token 和数据库链接。
4. 选择任务标题、状态和截止日期对应的 Notion 字段。

建议为 Nopin 创建专用 Integration，并且只授予它需要访问的数据库权限。

### 隐私与安全

- token 保存在仓库外的 macOS 应用数据目录。
- macOS 安全存储不可用时，应用不会保存 token。
- 渲染进程不会获得已保存的 token 明文。
- 请求直接发送到 Notion，不经过 Nopin 服务器。
- 应用不包含分析或遥测。

首次启动且没有 Nopin 配置时，应用会在本机优先导入旧 NotionPin 配置，其次兼容更早的 `electron-app` 配置。加密凭证、数据库设置和窗口偏好会保留，旧配置文件不会被删除。

不要将 Notion token 提交到 Git。如果 token 被意外公开，请立即在 Notion 中撤销并生成新 token。

### 本地开发

```bash
git clone https://github.com/crazzzzhao/notionpin.git
cd notionpin/notion-pin/electron-app
npm ci
npm run check
npm run dev
```

仅构建 Apple Silicon 或 Intel 版本：

```bash
npm run build:mac:arm64
npm run build:mac:x64
```

图标可编辑源文件为 `notion-pin/electron-app/build/icon.svg`。执行 `npm ci` 后，在 macOS 上运行 `npm run icon:mac` 可重新生成 PNG 和多尺寸 ICNS 图标。生成器使用 Electron 的 Chromium 渲染器保留 SVG 滤镜效果，再调用 macOS 工具生成 ICNS。

### 已知限制

- 目前仅支持 macOS 13 Ventura 或更高版本。
- 未签名、未公证，首次启动可能被拦截；手动允许不能保证解决所有启动错误。
- 因为没有 Developer ID 身份，更新后 macOS 可能再次询问钥匙串访问权限。
- 每次刷新最多读取 500 条任务；截止日期仅按日期编辑，不包含具体时间。
- 暂无自动更新，新版本需要从 GitHub Releases 下载。

## License

[MIT](LICENSE)
