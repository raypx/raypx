# Desktop 构建、签名与升级

Desktop 的发布宿主是 Tauri 2：macOS 使用 WKWebView，Windows 使用系统 WebView2 和按用户安装的 NSIS 安装器。CLI 仍由 Bun 编译，再作为版本匹配的 sidecar 放入安装包。Linux Desktop 尚未验证，不属于当前安装包 CI 矩阵。

迁移范围和验收项见 [Tauri 迁移计划](../plans/tauri-desktop-migration.md)。本文描述构建和发布操作，不代表尚未执行的平台门禁已经通过。

## 构建和验收

在仓库根目录执行：

```sh
bun run build:desktop
bun run package:desktop
bun run --cwd apps/desktop native:smoke
```

`build:desktop` 只构建 renderer。`package:desktop` 经 VP 先构建 renderer 和匹配的 CLI，再生成桥接方法/通知文案、复制 sidecar 并执行 `tauri build`。sidecar 只在 `src-tauri/tauri.bundle.conf.json` 中声明，由 `scripts/native/tauri.ts` 在 `build`/`bundle` 时合并；开发构建直接启动 `src-tauri/binaries` 下的 CLI，CLI 重新构建不会触发 Cargo 重编译 Desktop。原生打包不进入 VP 缓存，Cargo 自行管理增量状态。根 `bun run verify` 保持无需 Rust 或 GUI；原生检查是单独的显式门禁。

Electrobun 宿主、SDK、适配器及其构建入口已删除。普通 `check` 严格检查 renderer 和 Bun 脚本；Rust 的策略、真实子进程和实例锁测试由 Cargo 执行。打包后的 `check-release.ts` 按二进制内容匹配 Cargo fingerprint，并检查正式包不含 `native-smoke` feature 或 socket marker。

四个原生验收入口都先经 VP 构建相同版本的 renderer/CLI：

| 命令                                                           | 用途                                           |
| -------------------------------------------------------------- | ---------------------------------------------- |
| `bun run --cwd apps/desktop native:smoke`                      | 打包态本地工具、窗口、IPC、安全边界和重启恢复  |
| `bun run --cwd apps/desktop native:smoke:interactive`          | 可见窗口的同一组检查                           |
| `bun run --cwd apps/desktop native:beta`                       | 真实 HTTPS 账户、会话和远程任务验收            |
| `RAYPX_LIVE_AGENTS=1 bun run --cwd apps/desktop native:agents` | 已登录的真实 Claude/Codex 门禁，会消耗模型用量 |

Beta 门禁还要求 `RAYPX_LIVE_AGENTS=1`、独立的 `RAYPX_NATIVE_SMOKE_DATA_DIR`、`RAYPX_NATIVE_SMOKE_API` 和 `RAYPX_NATIVE_SMOKE_CREDENTIALS`。凭据文件只保存在本机；不要把账号、密码或文件内容放进 CI 日志。普通 CI 不会隐式运行付费推理。

PowerShell 中先执行 `$env:RAYPX_LIVE_AGENTS = "1"`，再执行对应的 Bun 命令；表中的环境变量前缀写法适用于 POSIX shell。

本机默认原生冒烟保持静默，不激活窗口或切换桌面。需要焦点、关闭和最小尺寸的交互验收在 GitHub Actions 的隔离 runner 执行；本机只有显式调用 `native:smoke:interactive` 才启用前台检查。原生最小窗口为 800 × 620，默认 1120 × 720。

macOS/Windows Desktop CI 使用 `rust-toolchain.toml` 选择工具链，执行格式、Clippy、Cargo tests、打包和原生冒烟。Ubuntu 的库检查排除 `raypx-desktop`，这不构成 Linux Desktop 的验收。CI 安装包只上传为 artifact；没有自动发布到用户更新端点。

macOS 睡眠唤醒检查在真实 Mac 上手动执行，CI runner 无法覆盖。使用打包态应用，主窗口可见和隐藏到托盘两种状态都要覆盖：通过苹果菜单「睡眠」或合盖，合计至少睡眠唤醒 5 次，其中至少一次睡眠超过 30 分钟。每次唤醒后确认窗口能重绘并响应键盘和点击，新的本地 IPC 请求（例如刷新文件或任务列表）能完成，运行中的终端继续输出，已登录时 API 请求能完成，隐藏状态下能从托盘重新显示窗口。WKWebView 曾有多次睡眠唤醒后 WebContent 与 Networking 进程通信中断、窗口永久无响应的报告（[Electrobun #550](https://github.com/blackboardsh/electrobun/issues/550)），Tauri 同样使用 WKWebView。出现卡死即判定失败，记录 macOS 版本、睡眠时长和睡眠前的界面状态；附带日志时不要包含凭据、Cookie 或私有文件内容。

## CI 签名配置

在仓库 CI Secrets 中配置私密材料：

| Secret                                        | 用途                                                |
| --------------------------------------------- | --------------------------------------------------- |
| `APPLE_CERTIFICATE`                           | Developer ID 证书及私钥的 PKCS#12 文件，base64 编码 |
| `APPLE_CERTIFICATE_PASSWORD`                  | PKCS#12 密码                                        |
| `APPLE_SIGNING_IDENTITY`                      | 与证书匹配的 Developer ID Application 签名身份      |
| `APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID` | 公证账号、应用专用密码和团队 ID                     |
| `WINDOWS_CERTIFICATE`                         | Authenticode 证书及私钥的 PFX 文件，base64 编码     |
| `WINDOWS_CERTIFICATE_PASSWORD`                | PFX 密码                                            |
| `TAURI_SIGNING_PRIVATE_KEY`                   | Tauri updater 的私钥，与系统代码签名证书分开        |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`          | updater 私钥密码（如设置）                          |

macOS CI 把证书导入临时 Keychain，打包后用 `codesign` 检查签名；公证凭据齐全时还检查 stapled ticket。Windows CI 临时导入当前用户证书库，用合并配置把证书 thumbprint 交给 Tauri，并检查 NSIS 安装器的 Authenticode 状态。临时签名材料在任务结束时清理。

未提供系统签名证书时，CI 摘要明确标记为 unsigned distribution。未配置公证凭据时，也不会把有代码签名的 macOS 包描述为已公证。这些安装包可供审阅，不能替代正式分发验收。

签名、公证及 sidecar 的 hardened runtime 必须在真实安装包上验证。配置文件或本地单元测试通过不等于 Developer ID、Windows 签名或更新安装已经通过。2026-10-27 用户因暂无凭据明确决定先跳过这些验收，以及需要真实账户的 HTTPS/Agent 验收；发布记录继续保留“未验证”。

## Updater 元数据与静态清单

在 CI Variables 中配置公开的更新设置：

| Variable                       | 用途                                                |
| ------------------------------ | --------------------------------------------------- |
| `RAYPX_UPDATER_PUBLIC_KEY`     | 与 updater 私钥匹配的公钥，编入 Rust 宿主           |
| `RAYPX_UPDATER_ENDPOINT`       | HTTPS 静态清单地址                                  |
| `RAYPX_UPDATER_ASSET_BASE_URL` | 安装包资源的 HTTPS 路径前缀；保留产物的相对目录布局 |

例如资源前缀可以是 `https://downloads.example.test/raypx/0.1.0/`，清单地址可以是 `https://updates.example.test/raypx/latest.json`。资源前缀不能包含凭据、查询参数或 fragment。Rust 宿主执行 updater；renderer 没有 updater 插件权限。

只有存在 `TAURI_SIGNING_PRIVATE_KEY` 时，CI 才开启 `bundle.createUpdaterArtifacts`。此时必须同时配置公钥和 HTTPS 清单端点。Tauri 负责对更新资源签名；静态 JSON 携带每个平台资源的签名和 HTTPS URL，客户端校验资源签名。JSON 文件本身没有额外的一层签名。

打包后，CI 运行：

```sh
bun apps/desktop/scripts/native/update-manifest.ts
```

脚本读取真实的 macOS `.app.tar.gz` 或 Windows NSIS `.exe` 文件及其同名 `.sig`，不推测文件名。资源 URL 使用 bundle 内的实际相对路径，文件名按路径段编码。输出为 `target/release/bundle/update-<platform>.json`，与安装包和签名一并上传。

脚本要求一个明确的更新资源及有界、非空的签名文件；发现旧版本资源混入时拒绝生成。没有 `RAYPX_UPDATER_ASSET_BASE_URL` 时明确跳过，不生成新的清单。CI 未配置 updater 私钥时同样跳过清单步骤。签名生成后不需要再提供私钥来组装 JSON。

默认平台取实际运行机器的 OS/架构。登记另一台机器已经构建的资源时，需明确设置 `RAYPX_UPDATER_PLATFORM` 为与安装包一致的 `darwin-aarch64`、`darwin-x86_64`、`windows-aarch64` 或 `windows-x86_64`。这个覆盖值只决定元数据的平台键，不会交叉编译或验证 sidecar 架构；本仓库的 sidecar 准备步骤会拒绝不匹配的目标。不要把不同架构安装包登记为同一平台。

下载同一次 CI 的 `desktop-macOS` 和 `desktop-Windows` artifacts，分别解压到 `.artifacts/desktop-downloads/` 的子目录后，可生成合并的静态清单：

```sh
bun apps/desktop/scripts/native/update-manifest.ts \
  --merge .artifacts/desktop-downloads \
  .artifacts/desktop-downloads/latest.json
```

合并拒绝版本不一致、重复平台、缺少签名和非 HTTPS 的资源 URL。先审阅 `latest.json` 与对应资源，按前缀要求暂存安装包、签名及其相对目录，再由发布操作上传清单。更新端点应最后切换到新清单，避免客户端先看到尚未上传的资源。生成、合并及 CI 上传 artifact 都不会发布更新。

## 从 Electrobun 升级

- 升级后重新登录一次。旧 WebKit/CEF 会话不迁移；Cookie 和系统钥匙串中的新会话数据由 Rust 宿主管理。
- Windows 用户需要重新确认远程控制授权。旧 Desktop 的远程 opt-in 文件不会静默授权新的 CLI owner；之后的受限设备凭据由 CLI 保管和续期。
- 旧 WebView localStorage 中未发送的草稿、面板宽度和最近选择不迁移。升级前处理需要保留的草稿。
- 设备偏好文件和实例锁沿用应用本地数据目录下的 `com.raypx.desktop/stable`；CLI profile、目录授权、任务、Cron 和记忆继续保留。
- macOS daemon 使用安装后的稳定 CLI 路径。升级时核对实际服务注册的可执行文件；不要仅按旧计划假定的 bundle 路径自动重装 launchd。GUI Quit 在 macOS 和 Windows 上都保留 daemon 工作。Windows daemon 从 `%LOCALAPPDATA%\Raypx\bin` 下按构建区分的副本运行，避免锁住安装目录里的 CLI。

发布记录需分别填写 macOS、Windows 打包态、macOS 睡眠唤醒、真实 HTTPS、真实 Agent、签名、公证、更新安装及包体积的证据。没有执行的检查保留“未验证”；Linux Desktop 继续明确标记为未验证。

官方参考：[macOS 签名](https://v2.tauri.app/distribute/sign/macos/)、[Windows 签名](https://v2.tauri.app/distribute/sign/windows/)、[Tauri updater 静态 JSON](https://v2.tauri.app/plugin/updater/#static-json-file)。

## Headless macOS packaging

For a host without Finder Automation permission, use the supported CI path rather
than changing macOS privacy settings. After the ordinary release build has produced
its application, `CI=true bun scripts/native/tauri.ts bundle --bundles dmg --no-sign`
from `apps/desktop` creates an unsigned DMG without Finder decoration. The wrapper
merges the packaging-only sidecar configuration; a direct `tauri bundle` omits the CLI. Full CI packaging
uses its configured signing credentials. An unsigned DMG establishes size and
contents only; it does not establish Developer ID signing or notarization.
