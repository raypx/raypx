# Raypx 回迁 MyGo + Bun、单次编译分发与 Strobe 验收

状态：2026-11-06，仓库实现已切换至 MyGo/Bun，平台验收待完成。
本次回迁以 `canary` 的 `986f58d5531c159f24da97ed532442bc0071ed82` 为功能对照，
以 `159b4bc5fe2e82245876cfa1ce473e104e31e3a9`（`d9c8fd6b^`）的 MyGo 实现为宿主恢复参考，保留后续功能修复和包边界。
当前决策见 ADR 0046。本文是统一实施与验收清单，
不将源码检查、Linux 构建或预研结果计作 macOS/Windows 发布通过。

## 交付方式

每个冻结的交付候选提交、每个目标平台只编译一次生产 `raypx`。
直接从 `apps/cli/src/main.ts` 执行 Bun compile，Desktop 安装包、独立 CLI
压缩包和产物验收共同消费这份可执行文件。取消 `vp pack → Bun compile`
的中间打包步骤，合并原计划的两个实施阶段。VP 继续拥有唯一任务图和缓存。

首轮覆盖 macOS arm64 和 Windows x64，分别编译一份，输出 `.tar.gz` 和 `.zip`。
可执行文件包含 Bun runtime 和 JS 依赖，用户无需预装 Node 或 Bun。
解压后运行 `./raypx` 或 `.\raypx.exe`；将完整解压目录加入 `PATH` 后可直接调用
`raypx`。项目包管理器和外部 provider CLI 使用用户环境，并保持用户工具的 PATH 优先级。

每个压缩包包含 `raypx`、同级 `herdr/`、完整性清单、许可证和简短使用说明。
说明覆盖首次账号/origin 绑定的实例注册、离线使用、目录安装和升级步骤。
最终压缩包附 SHA-256，通过分发 CI 提供下载。

## 1. 冻结基线并完成回迁

- 从独立草稿继续，记录草稿和当前 `canary` 的对照提交，先修复已知 lint 问题。
- 恢复 MyGo v0.7.4、Go 1.27.3 和 Bun 1.4.4。开发和 CI 使用固定 Bun 版本安装依赖、
  运行脚本和构建；冻结锁文件安装不得改写锁文件。
- API、Web、Relay 恢复 Bun 运行，API/Web 使用对应 Nitro Bun preset。同步调整
  workspace/catalog 配置、唯一锁文件、安装策略、工具脚本、Docker、CI、任务缓存输入
  和校验规则。更新原生 gate 的选择和最终结果汇总，避免遗漏 Go、归档或安装验收任务。
- 正常 CLI 构建改为编译后的可执行目录，移除 Node JS 分发、专用 Rust launcher 和
  Node staging。保留既有包边界，不回退当前产品功能。
- 带回首轮 Agent 输入修复和 Jobs、Memory、Auth 包边界调整；保留 Windows profile
  ACL 修复及 45/75/90 秒的 daemon、宿主和 smoke 等待上限。
- 保留当前协议、SQLite schema 和迁移日志、离线身份、实例锁、授权边界及任务恢复规则。
  换宿主前退出旧 GUI、显式停止旧 daemon，并等待锁释放。
- MyGo 使用新的原生会话存储命名空间和系统凭据键，首次重新登录。Tauri 及历史宿主会话
  不读取、不导入、不删除。本地 profile、离线身份、历史、偏好和文件授权继续保留。
- 实施时新增取代 ADR 0045 的决策记录，同步根目录和相关 workspace 的 AGENTS.md、
  当前架构、开发及分发文档。

## 2. 从源码单次编译

CLI 的 VP build 任务按以下顺序执行：

1. 检查嵌入的 SQLite schema/迁移日志与源文件一致。
2. 验证实际 Bun 版本，生成一次 build identity。
3. 使用 `bun build --compile` 或等价的 `Bun.build` API，直接编译 `src/main.ts`。
   保留 ESM、minify、bytecode；编译常量和 manifest 使用同一 build identity。
4. 准备目标平台的完整 Herdr 资源、许可证和使用说明，生成目录完整性清单。
5. 上传完整 CLI 目录为不可变 CI artifact。

缓存指纹覆盖源码及实际依赖、编译选项、Bun 版本、平台/架构和影响结果的环境变量。
明确声明构建输出并保留叶命令的继承环境。Herdr 准备、签名、复制和归档均不触发 CLI 重编译。
开发调试产生的新候选构建具有新的 build identity。

现有 macOS arm64 临时入口试验仅作为预研证据；源码直编仍需通过完整产物 smoke
和 Windows 验收。

## 3. CI 传递、签名和目录生命周期

- 每个平台的 prepare job 是该候选交付 CLI 的唯一编译者。manifest 绑定提交、平台、
  架构、Bun/Herdr 版本、build identity 和文件校验值。
- 下游引用精确 artifact ID，下载并校验完整目录后消费。VP 缓存仅用于加速 prepare；
  下游产物缺失或不匹配直接失败，禁止通过任务依赖或脚本再次编译补齐。
- 正式分发时，在受控签名环节签名 CLI/Herdr，按内层到外层顺序更新清单，形成一份
  已签名 payload。Desktop 和独立 CLI 压缩包复用它；后续宿主与安装包签名不得改写 payload。
  分别保存签名前后的校验值，签名不改变 build identity，归档完成后计算压缩包 SHA-256。
- native smoke 使用隔离测试宿主和同源 CLI artifact；最终交付件另行进行签名后的归档、
  安装和握手验收。测试宿主使用独立应用身份、目录和凭据。
- Windows daemon 和连接器保留完整、版本化的运行目录副本，包括可执行文件、Herdr
  和清单。保留原子安装、运行租约和使用中版本保护，以及连接器所有权校验、显式修复和防降级。

## 4. 测试直接使用交付二进制

移除依赖 `dist/main.mjs` 的 smoke 启动方式和临时 provider 入口编译。
测试框架可使用固定 Bun 运行，CLI 进程必须使用 prepare 生成的实际二进制。

四个内置 provider（Anthropic、OpenAI、Google、OpenRouter）的离线加载探针通过外部测试代理
和必要的临时测试 CA 拦截真实 SDK 请求。先验证四个 SDK 的代理和证书配置均能可靠命中，
再替换原探针；该可行性验证直接运行交付二进制，不生成另一份探针可执行文件。

每个探针使用独立、已注册的合成 profile 和假凭据，拒绝外部网络访问，从代理收到的请求
确认对应 SDK 已加载，并检查 stdout/stderr 脱敏。自定义 `base_url` 可能切换 provider
实现，不能替代四个内置 provider 的覆盖。代理未命中或无法隔离外部网络时验收失败，
不得跳过探针、恢复测试入口编译或加入产品专用测试开关。

继续覆盖实际二进制的 provider/模型目录、流式输出、工具审批、取消和 daemon 重启恢复。

## 5. 回迁、双平台验收与发布

- 新增由当前 Node 基线生成的合成 SQLite profile，验证 Bun 打开、写入、关闭和重开后，
  迁移日志、项目/任务历史、离线实例身份、Host 授权、事务回滚及跨进程锁正确。
  保留原有 Bun fixture 和未知格式拒绝测试；恢复不得重复执行未确认的副作用。
- 两个平台均解压实际 CLI 压缩包，在含中文、空格和 `#` 的目录里以空 `PATH` 验证版本、
  内置 provider/模型目录、Herdr PTY 和 daemon 重启恢复。保留必要系统环境，测试 shell
  使用绝对路径。
- 启动 Windows daemon 或安装连接器后移走原解压目录，再首次打开 PTY。旧任务运行时
  更新安装目录，确认资源保留、任务继续执行，租约释放后才能回收旧版本。
- 安装后的 Desktop 与独立 CLI 覆盖“CLI 先启动”和“Desktop 先启动”，核对同一隔离
  daemon 的 PID/epoch。退出 GUI 后任务继续；显式停止 daemon 后锁释放；不同 build identity
  明确拒绝连接。
- native smoke 从实际打包的 `.app` 或 NSIS 安装目录启动，启动前确认测试宿主包含
  `native_smoke` 标签。生产宿主检查不含该标签、smoke 控制入口和 inspector。
  失败日志区分产物校验、进程退出、renderer 就绪和 CLI 握手。
- 运行聚焦测试和 `bun run verify`。发布准备执行 `bun run verify --full`，另行完成独立
  后端、浏览器、隔离 Compose/Railway 和双平台原生验收。Docker 内继续使用 VP `--no-cache`，
  保留体积报告和失败证据。
- 在最终签名交付件上重新解压 CLI 压缩包、安装 Desktop 并验证共用 daemon。
  正式发布前完成签名、公证、安装升级、系统凭据持久化和 Windows 文件占用验收。
  对应平台完整矩阵通过后才发布；缺失签名凭据或未执行的检查记录为未验证。

## 6. Strobe 性能验收

### 工具与平台边界

参考 OpenCode 使用的 `@hona/strobe` **0.13.0**，将其作为开发和验收依赖。
版本进入 `catalog:dev`，实际调用工具或导入 bench 类型的 workspace 声明直接 devDependency。
Strobe 从外部启动和测量应用，无需给生产应用加入 SDK；它不进入 CLI 或 Desktop 分发目录。

| 测量对象                          | 接入方式                              | 当前支持边界                                                                              |
| --------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| macOS arm64 MyGo/WKWebView        | `native()` / `kind: "native"`         | 窗口、可访问性、进程 CPU/内存等外部指标；WKWebView 页面内部测量不受支持                   |
| Windows x64 MyGo/WebView2         | 先验证 `native()`，再验证 `webview()` | WebView2 模式通过隔离目录和临时 CDP 端口测量页面；上游验证过 release Tauri，MyGo 仍需实测 |
| Desktop renderer 的浏览器 fixture | `url()`，生产编译的 SPA 和合成数据    | 可测页面主线程和交互；结果描述浏览器 fixture，不能代替原生 WebView 验收                   |
| 独立 CLI                          | `cli()` / `strobe run`                | 测量实际交付二进制的完整命令；命令结束后遗留 daemon 会被判为 `RunIncomplete`              |

OpenCode 配置未写 `kind`，使用的是默认 Electron 模式。Raypx 必须显式选择
`native` 或 `webview`，不能照抄 Electron 调试端口、`launch.inspect`、数据库路径和更新器缓存设置。
Windows 的 WebView2 调试变量由 Strobe 在该次测量进程中注入，不持久启用产品 inspector；
MyGo 若阻止附加或窗口尺寸设置，记录拒绝原因，保留可运行的 native 场景。

macOS 上游明确拒绝 `webview()`（`EngineUnsupported`）。native 模式能否读到 MyGo 页面的
可访问性元素也要实测；不可读时只报告窗口/进程指标，不能将显示窗口计作工作台已就绪。

### 产物和任务所有权

首轮以已解包的两份 Desktop 和 CLI 交付目录作为 base/head，记录各自提交、build identity、
文件校验值、签名状态和 WebView/runtime 版本。Desktop 使用 `.app/Contents/MacOS/...`
或 NSIS 实际安装目录的应用可执行文件，不能测安装器或替代 launcher。

根目录 `strobe.json` 首轮只配置 `apps`，使用 `app:<id>` / `exe:<path>` 比较现有产物，
不让 Strobe 的 build 回调再次构建原生程序。独立 CLI 与 Desktop 仍消费各候选平台的唯一
CLI artifact。以后增加源码 A/B 时，经 VP 为每个候选、每个平台准备一次产物。

Desktop bench、专用 fixture 和说明由 Desktop 拥有；CLI bench 由 CLI 拥有；
复用的校验/证据整理放在 Tooling 的 `src/performance/`。应用之间通过 CLI 绝对路径和
公开契约交互，不导入彼此的 composition root 或私有源码。

新增的显式 perf 任务通过 VP 调度，测量任务不缓存结果；构建任务继续使用正常缓存。
浏览器 fixture 的 build/serve 另设配置，复用已有 SPA 构建和 loopback 静态服务，
build 回调只构建 renderer，不调用仓库总 build 或原生打包。bench 和 fixture 纳入所属
workspace 的显式 TypeScript 检查，不进入普通单元测试发现范围。

### 已实现的配置

根目录 [`strobe.json`](../../strobe.json) 是配置入口，只有 `raypx-base/head` 两个 native profile。
通过 `RAYPX_STROBE_BASE_EXE`、`RAYPX_STROBE_HEAD_EXE` 指向完整交付目录中的实际宿主；
head 继承 base 的隔离设置，无 build 回调。bench 在非计时准备阶段生成合成 enrollment、
TOML 和隔离 profile，不能把随机空闲端口当作可用 fixture 服务。

默认 `guard` 保护真实用户 default profile 的 daemon metadata；其他命名 profile 由
操作者加入 guard。daemon 的身份通过认证 `/info` 中的 PID、epoch 和 build identity 核对。
macOS 保留 LiveChannel，必须在独立测试账号或一次性 runner 内运行。

### 隔离与独立 daemon

- `RAYPX_HOME` 只选择 TOML 配置目录。必须另外验证 native 数据目录、CLI profile、
  WebView 数据、实例锁和 daemon endpoint 全部在此次 `ctx.home` 内。
  CLI fixture 使用显式 `--data-dir` / `--profile`，不能靠 `local_profile` 推断数据根目录。
- macOS 的 Cocoa `~/Library` 和系统凭据存储不随 `HOME` 重定向。首轮原生性能测试使用
  独立 OS 测试账号或一次性原生 runner，保留 Strobe 的 `LiveChannel` 保护。
  只有确认某个目录已由现有配置实际迁入私有 home 后才能声明 `moved`；不能用它跳过隔离检查。
- 仅使用合成项目、历史、账号和 provider 凭据。配置中的失败代理不保证拦截所有原生网络栈；
  测试环境另行限制外网，并检查更新器、遥测或 provider 请求没有后台流量。
  若需要停用更新器，使用产品已有配置或测试环境隔离，先确认实际行为，不复制 OpenCode 的缓存阻断文件。
- 从 bundled CLI 启动的隔离 daemon 保留 `STROBE_HOME` / `STROBE_OWNER` 继承环境，
  核对 Strobe 的进程集合确实包含宿主、WebView/XPC 和该 daemon。warm daemon 通过
  `ctx.exe` 对应的 bundled CLI、`ctx.env` 和该次私有 profile 在非计时准备阶段启动。
- 不自动停止操作者的旧 daemon 以绕过版本不匹配。每个 variant/profile 有自己的 daemon；
  teardown 显式停止本次启动的 daemon、等待锁和子进程释放，再删除私有目录。
  GUI Quit 后任务继续的产品行为保持不变，Strobe 结束测量时的进程清理不能算作业务 Quit 行为。

### 首轮场景与指标

| 场景                                         | 主要指标                                            | 边界                                                        |
| -------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| 未注册首启到主窗口显示                       | `launch.ready`，终点为窗口 visible                  | 独立于工作台可用性，不用固定 sleep 充当 ready               |
| 已注册 profile，daemon 已停止，到工作台可用  | `launch.ready`，终点为实际可访问元素/就绪信号       | 包含此次 daemon 启动；先证明就绪条件有效                    |
| 已注册 profile，daemon 已运行，到工作台可用  | `launch.ready`                                      | 非计时准备阶段启动同 build 的隔离 daemon                    |
| 工作台稳定空闲 5 秒                          | `cpu.app.total`，内存作次要指标                     | 记录整个进程集合、固定窗口状态；不把第一轮初始化当空闲      |
| GUI 退出后的隔离 daemon                      | `record pid:<本次 daemon>` 的 CPU/内存              | 单独命名场景，确认工作确实继续，记录进程集合变化            |
| 长对话滚动、输入和流式更新                   | Windows webview/浏览器的 `main.work` 或对应可用指标 | 固定合成数据和输入节奏；macOS native 不报告页面主线程指标   |
| CLI `--version`、provider/模型目录等完整命令 | `run.duration`，可用时补 CPU/峰值内存               | 运行实际二进制；不把退出后遗留 daemon 的命令当普通 CLI case |

冷/热 profile、冷/热 GPU cache 和 daemon 状态分别声明，base/head 使用相同工作负载。
像素启动指标在 macOS 需要 Screen Recording；可访问性驱动需要相应权限。
不支持、权限不足、无真实 GPU、窗口隐藏或环境无效时保留 refusal，不记为零或通过。

下列命令可在准备好对应平台交付目录的隔离测试设备上执行；日常使用下文的 VP perf 入口：

```sh
strobe config .
strobe status
strobe bench apps/desktop/perf/startup.bench.ts --target native --check --head app:raypx-head
strobe bench apps/desktop/perf/startup.bench.ts --target native --aa --head app:raypx-head
strobe bench apps/desktop/perf/startup.bench.ts --target native --base app:raypx-base --head app:raypx-head
strobe report experiment <exp_id> --format md
```

先通过配置检查和单次 `--check`，再用同一构建 A/A 检查测量方法，最后运行成对 A/B。
报告保留实验/录制 ID、机器和 OS、Strobe/WebView/Bun 版本、窗口尺寸与刷新率、profile/cache
策略、参与进程、主要指标和区间，以及 refusal/unclear 状态。
初期采用手动触发的独立性能 job，不阻塞日常 `verify`，不与其他原生交互任务争用同一设备。
确认方法稳定后再决定回归阈值；正确性 smoke、签名、公证和安装验收继续独立执行。

Strobe 原始数据保持工具自己的存储布局，导出的报告和证据写入 `.artifacts/performance/`。
浏览器源码归因可单独保留 hidden source maps；map 选项进入 VP 缓存指纹。
若现有 analytics 的 map 注入会改变脚本字节，报告中标明测量构建，不能宣称与交付文件相同。
本接入不要求额外编译 CLI 探针，不默认打开 Bun inspector 或更改 bytecode/签名选项。

### 调研来源

- [OpenCode strobe.json（固定参考提交）](https://github.com/anomalyco/opencode/blob/286beb081a16d59d269b328329921fef3b15eda9/strobe.json)
- [OpenCode 性能场景与隔离说明](https://github.com/anomalyco/opencode/blob/286beb081a16d59d269b328329921fef3b15eda9/packages/app/perf/README.md)
- [OpenCode 启动 bench](https://github.com/anomalyco/opencode/blob/286beb081a16d59d269b328329921fef3b15eda9/packages/desktop/perf/startup.bench.ts)
- [Strobe SPEC：variants、native、WebView 支持及隔离](https://github.com/Hona/strobe/blob/9786578eceaf7d9ffe2b6239ead3db11d1831bd1/SPEC.md)
- [@hona/strobe 0.13.0](https://www.npmjs.com/package/@hona/strobe/v/0.13.0) 的发布包 schema 与类型声明已核对。

## 7. 实现入口与执行方式

- `apps/cli/scripts/build.ts`：源码直编、同一 `builtAt` 常量/清单及 Herdr 准备；构建消费者设置
  `RAYPX_CLI_PAYLOAD` 后构建命令直接拒绝执行。`distribution.ts` 管理 verify/sign/notarize/archive；外层签名不使用 `--deep` 改写 payload。
- `packages/tooling/src/build/cli.ts`：完整目录校验和签名后重新封存；manifest 使用 `builtAt`
  表示现有协议的 build identity，另记录 `commit/platform/arch/version/bunVersion/herdrVersion/files`。
- `.github/workflows/native.yml`：每平台 prepare 构建一次，签名、重新封存、归档并解压 smoke；
  下游精确下载 artifact ID。`check-release.ts` 比较安装包中的 inventory 与准备产物。
- `apps/cli/scripts/archive-smoke.ts`：校验最终归档 SHA-256，中文/空格/`#` 临时目录解压并
  测实际二进制；Windows 另验证移走原目录后首次 PTY、稳定连接器和 daemon 重启。
- `apps/cli/tests/fixtures/sqlite/node-baseline`：由 Node 基线编写的纯合成 profile 和离线签名身份。
  测试验证 Bun 读写、事务回滚、历史、授权、迁移日志和离线签名，独立进程测试锁/租约。
- MyGo 会话库为 `mygo-sessions-v3.sqlite`，系统凭据键前缀为 `mygo-session-key-v3-`。
  历史会话文件不触碰；未知新库格式直接拒绝，不自动导入或清理。
- `strobe.json` 只含 `raypx-base/head` 两个 native profile，无 build 回调。
  `apps/{desktop,cli}/perf` 拥有各自 bench，Tooling 负责隔离环境、A/A/A/B 顺序和证据导出。
  `perf` 为 uncached VP task，不依赖 CLI 构建。原始实验仍保存在 Strobe 自身目录，导出在
  `.artifacts/performance/`，含实验 ID、产物 identity、OS/机器、窗口/缓存、进程与区间/拒绝状态。

先准备两个通过目录完整性校验的真实 Desktop 交付目录，设置：

```sh
export RAYPX_STROBE_BASE_EXE="/absolute/base/Raypx.app/Contents/MacOS/Raypx"
export RAYPX_STROBE_HEAD_EXE="/absolute/head/Raypx.app/Contents/MacOS/Raypx"
export RAYPX_STROBE_CLI_BASE="/absolute/base/Raypx.app/Contents/Resources/bin/raypx"
export RAYPX_STROBE_CLI_HEAD="/absolute/head/Raypx.app/Contents/Resources/bin/raypx"
# macOS 必须在独立 OS 测试账号/一次性 runner 中执行；该变量是环境声明，不绕过 LiveChannel。
export RAYPX_STROBE_DISPOSABLE_ACCOUNT=1
bun run raypx-dev tasks desktop#perf -- all
bun run raypx-dev tasks cli#perf
```

Windows 对应使用实际 NSIS 安装目录的 `Raypx.exe` 和 `bin/raypx.exe`。
`RAYPX_STROBE_READY_SELECTOR` 只能填写已经实机验证的 native 可访问性 selector。
未提供时工作台 native 场景标记 unsupported；窗口可见的首启场景仍可测量。
Windows `all` 顺序运行 native 与 webview，附加拒绝保存在独立证据中，不吞掉已完成的 native 结果。
`RAYPX_STROBE_RECORD_DAEMON=1` 会在空闲 block 的非计时收尾阶段退出 GUI，验证同一 PID/epoch，
确认 Desktop 实例锁释放，再用 `record pid:` 单独录制 5 秒，最后仅停止本次隔离 daemon。
macOS 使用系统 Quit 快捷键；Windows 必须提供已经验证的 `RAYPX_STROBE_QUIT_SELECTOR`。
窗口 close 隐藏到托盘不能作为 GUI Quit。WebView2 长对话 bench 通过交付 CLI 和本地合成
Pi endpoint 创建历史，再驱动真实页面滚动、输入和流式 follow-up，无生产测试入口。

独立浏览器 fixture 使用产品 `TaskWorkspace`、200 条合成消息和合成流式更新，不加载 native bridge：

```sh
bun run raypx-dev tasks desktop#build:perf
export RAYPX_STROBE_BASE_SPA="/absolute/base/performance-spa"
export RAYPX_STROBE_HEAD_SPA="/absolute/head/performance-spa"
bun run raypx-dev tasks desktop#perf -- browser
```

SPA fixture 仅做 renderer 生产编译，无 CLI compile；静态服务仅绑定 loopback，页面外网请求拒绝。
必须分别提供 base/head SPA 目录才能解释 A/B；两者相同时只用来校准 A/A。
`.github/workflows/performance.yml` 是手动性能入口，精确接收两个 distribution run/artifact ID；
使用专用 `raypx-perf` runner，设备不同时运行其他原生交互任务。首轮无阻塞回归阈值，
测量失败、进程归属缺失和平台拒绝仍如实保留；浏览器开关只提供同构建 fixture 校准。

## 8. 发布前仍需执行的关卡

macOS 临时直编仅为预研。Linux 上的编译、类型和合成数据测试不能替代以下关卡：

- 双平台最终归档、空 PATH 的 Herdr PTY/daemon 恢复及真实 SDK HTTPS 代理命中；
- 安装后的 Desktop/独立 CLI 双向启动、同 daemon PID/epoch、GUI Quit 后任务继续和显式 stop；
- Windows 新旧交付候选更新、任务运行时资源保留、租约释放后的回收及文件占用；
- MyGo WebView2 临时 CDP/窗口控制、macOS 工作台可访问性 selector 与完整进程归属；
- 系统凭据持久化、升级、签名、公证、最终安装后的握手和完整发布矩阵。

本轮后端、浏览器、隔离 Compose/Railway 和完整验证的 Linux 结果见第 9 节；
各发布候选仍须按冻结提交执行所选矩阵，不能用历史结果替代。

四个 SDK 代理若未命中，功能 smoke 直接失败。Linux 辅助验证只接受 `/sys/class/net`
中仅有 loopback 的网络命名空间（例如 `docker run --network none`），普通主机直接拒绝。
Linux 结果不计入 macOS/Windows 交付验收。
离线容器先准备依赖、Go 模块和 Herdr 缓存，再运行 `bun run verify --full --no-cache`；
该选项直接透传 VP，避免容器内文件系统跟踪停滞，不跳过任何已选择的检查或产物 smoke。
环境或平台不可用时记录 unavailable，禁止描述为通过，也不通过重编探针绕过。

## 9. 本次实现的验证记录

2026-11-06 的 Linux 辅助验证已完成冻结锁文件安装及
`bun run verify --full --no-cache`（92 个 VP 任务通过），包含格式、lint、policy、Knip、
全部源码检查/测试、Go policy/host、所有当前平台构建和产物探针。CLI 完整套件为
464 passed、1 skipped；Desktop 为 268 passed；Tooling 为 258 passed。
完整验证 JSON 和日志保存在 `.artifacts/verification/mygo-bun-full.{json,log}`。
最后的日常 `bun run verify` 也已通过（83 个任务成功、20 个缓存命中），证据为
`.artifacts/verification/mygo-bun-daily.{json,log}`。

隔离后端验收通过 PostgreSQL 58 项、Redis 4 项及 Relay cluster 9 项；
Web/Desktop 浏览器 smoke 8 项通过。隔离 Compose 和 Railway 的镜像、迁移、就绪、
SSR、静态资源、登录、Cookie 和 Relay 验收通过，证据保存在 `.artifacts/deployment/`。

实际编译 CLI 在 `docker --network none` 中通过完整产物 smoke，包含四个 SDK 的
HTTPS 代理命中和脱敏、中文/空格/`#` 路径、空 PATH、Herdr PTY、流式输出、
审批和 daemon 重启恢复。WebView2 conversation fixture 的合成任务创建/重置也通过
实际 CLI 验证；该检查未运行 WebView2 驱动，不计作 Windows 原生验收。

Strobe CLI 的单次检查、A/A、A/B 流程已在同一 Linux 最终产物上跑通，三个阶段均导出
JSON/HTML，测量后 payload 校验值保持一致。证据位于
`.artifacts/performance/2026-11-06T09-09-54.979Z-e7ed8b27/`。
该共享虚拟机缺少设备校准和 CPU 隔离，结果只证明工作流可执行，不用于性能结论。
原生 Strobe、macOS/Windows 安装/签名与第 8 节平台关卡仍未验证。
