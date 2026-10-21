# 执行方案：用 Web 承担手机端能力

> 交给 Codex 分阶段执行。审阅基线：raypx `main` 33fc56d，voidmix `main` 84660a8。
> 本文是待实施方案，不代表功能或验收已经完成。执行前重新核对分支和工作区，保留无关改动。
> 每个实现阶段独立提交、独立验收；按下表的依赖推进，不把阶段编号当成全部串行的依赖。

## 背景与目标

Expo 原生 App 已于 2026-10-18 移除（见 `docs/architecture/README.md`）。手机端需要的三项能力改由 Web 提供：

1. 在手机上查看 Desktop 自动化任务的定义摘要、最近运行状态和同步时间。
2. 从手机上传照片、相册图片或文档，并在 Desktop 应用中下载到已授权目录。
3. 首次使用引导：安装 PWA、下载 Desktop、在 Desktop 登录同一账户、上传第一个文件。

不做：原生手机 App、离线编辑、手机远程触发或修改 Desktop 任务、上传任务输出、断点续传。任务完成推送留到可选阶段 6。

## 阶段依赖与完成定义

| 阶段                         | 前置依赖             | 独立交付结果                                   |
| ---------------------------- | -------------------- | ---------------------------------------------- |
| 0a：storage 代码与发布包     | 无 Raypx 阶段依赖    | PR、合并后的校验结果、准确的发布包与 commit    |
| 0b：维护者发布 storage       | 0a                   | npm 精确版本可用；维护者配置 trusted publisher |
| 1：移动端与 PWA              | 无                   | 移动布局、静态离线页、安装引导                 |
| 2：设备与任务同步            | 无；已有账户基础设施 | API、Desktop/CLI 同步协议及真实后端测试基座    |
| 3：Web 任务页                | 1、2                 | 手机只读任务页、设备管理                       |
| 4a：上传服务与 Web           | 0b、1                | fs/R2 上传、确认、列表、下载、删除与清理       |
| 4b：Desktop 取回文件（必做） | 4a                   | 二进制文件下载到 root grant 授权目录           |
| 5：首次使用引导              | 1、2、4b             | 账户级引导状态与可用下载入口                   |
| 6：失败推送（可选）          | 1—5 均稳定且验收通过 | 独立设计与验收后再实施                         |

- 0b 等待维护者时，1—3 可以继续推进；阶段 4 的合入依赖 npm 已发布，不能把本地 link 或 tarball 当成发布验收。
- 阶段 3 自带可用的下载/登录空态，不链接尚不存在的阶段 5；阶段 5 再增强引导。
- 4a、4b 分别提交和验收，两者完成才算“手机上传、Desktop 取回”完成；不能把 4b 降为可选。
- 允许实现阶段合入时保留明确列出的平台发布门禁，但报告必须区分“实现完成”“自动检查通过”“发布验收通过”。没有执行的必要门禁保持未完成。

## 必须遵守的仓库约定

开始前读根目录 `AGENTS.md`、`docs/README.md` 和受影响 workspace 的 `AGENTS.md`。重点：

- Bun isolated linker：每个 workspace 声明直接依赖；Raypx 外部版本放根 catalog，运行时用 `catalog:`、工具用 `catalog:dev`，内部包用 `workspace:*`。Voidmix 按其自身仓库规范发布，不能套用 Raypx 的 catalog 规则。
- 远程契约放 `@raypx/contracts/api`，本地设备协议放 `local`；不把 local 方法注册到公开 RPC，也不从 Desktop 导入 CLI 源码。
- API 是组合根：依赖在 `apps/api/server/runtime/shared.ts` 创建并注入，配置经 `@voidmix/env` 在 `env.ts` 声明。库包不直接读取应用环境变量。
- 每个 RPC 都重新解析 Better Auth session；调用方不传 actor userId。设备、上传和引导状态都按当前 session 的用户隔离。
- 不记录凭据、token、cookie、签名 URL、用户文件内容或任务 output。同步字段采用显式白名单，不序列化整个本地 job/run 对象。
- 新 PostgreSQL 迁移只用于隔离的新库，绝不连接旧库或生产库。测试数据库的建立、迁移和清理遵守下文门禁。
- 所有用户文案同时提供中英文，保持 `@raypx/i18n` catalog 对齐；保持键盘可达、可见 label、light/dark 和 reduced motion。
- `packages/ui` 只放通用展示原语；设备、任务、上传业务组件放应用的 feature 目录，实际有多个消费者后再提取独立 feature 包。
- Web/API 的 dev、build、preview 使用 `bun vp`，生产用仓库固定的 Node；不要改成 `bun --bun vp`。测试与工具脚本遵循各 workspace 现有命令。
- 本地文件、任务和偏好继续独立于账户运行；登出不清除本地任务、目录授权或安装标识。

## 共用验证基座与门禁

### 数据库与真实后端 e2e

1. 数据库阶段开始前准备独立 PostgreSQL 17 实例/测试库，名称以 `_test` 结尾，并核实它确实是可销毁的测试库；名称本身不能证明隔离。
2. `bun run generate` 读取 `DATABASE_URL`，生成时也显式指向隔离库。运行集成测试使用 `NODE_ENV=test` 和 `TEST_DATABASE_URL`；不得从开发/生产默认值推断测试目标，不输出连接凭据。
3. 阶段 2、4a 共用真实后端 fixture，由先执行者建立、后执行者复用；并行开发时指定一个实现负责人，不重复建立。fixture 启动编译后的 API/Web、迁移隔离库、准备可验证并登录的测试账户、隔离每个用例的数据并清理。4a 负责临时 fs root、存储签名配置和测试后对象清理。两阶段的真实后端验收均以此为前置，但不因此互相依赖业务实现；测试辅助入口不能进入生产路由。
4. 现有浏览器 auth/account mock 只用于布局和响应展示；真实“登录 → tasks”“上传 → ready → 下载”必须访问真实 API。Web SSR 的 API 请求也必须接到该 fixture，不能仅靠浏览器 route mock。

### 必须显式运行的检查

| 门禁                                                             | 适用范围                       | 完成依据                                                |
| ---------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------- |
| 窄范围单测/组件/集成测试，再 `bun run verify`                    | 每个实现阶段                   | 实际命令与结果；verify 不包含下列显式门禁               |
| `NODE_ENV=test TEST_DATABASE_URL=<隔离库> bun run test:postgres` | 2、4a、5，以及其他改 DB 的阶段 | 真实 PostgreSQL 鉴权、事务、竞态和迁移检查              |
| `bun run test:e2e` 或报告中注明的筛选命令                        | 1、3、4a、5                    | 编译产物上的浏览器验收；新增用例必须真正执行            |
| Desktop 构建、`native:smoke` 与打包态检查                        | 2、4b                          | macOS/Windows 的真实原生桥接、HTTPS 会话和文件/托盘行为 |
| 手机安装和 R2 实测                                               | 1、4a                          | 真机/隔离桶的实测记录，不能由模拟视口或 fs 结果替代     |

`bun run verify` 通过不代表 PostgreSQL、浏览器、真机或打包态已通过。不可用检查要报告原因、缺少的环境和后续验收步骤，不能将“说明未跑”等同于阶段验收完成。

## 阶段 0：发布 `@voidmix/storage`（在 voidmix 仓库）

基线时实现位于本地 `feat/storage`（e1a555a），尚未推送。现有库提供 `createStorage`、`signUpload`、`get`、`put`、`head`、`delete`、`list`、`signDownload` 和本地签名 handler。

### 0a：代码合并与可发布包

1. 把 `feat/storage` rebase 到 voidmix 最新 `main`，解决 README 包表格和 docs 注册冲突，保留 main 新增的 `@voidmix/drizzle-kit`。
2. 运行窄范围测试及 `bun run verify`，推送分支、开 PR。不得在未验证的情况下执行发布。
3. 合并后在干净、最新的 `main`，按 `docs/development/publishing.md` 重新执行 `verify → release:plan → release:pack`。首次版本为 `0.0.0-alpha.0`，跳过 `version-packages`。
4. 报告 packed commit、tarball 路径、计划发布的全部包/版本与检查结果。release plan 可能包含其他尚未发布包，不能假设只有 storage。

阶段 4a 使用现有 `get` + 有界读取 + `put` 完成临时对象确认，不假设库已有 copy、条件写入或可取消 PUT。后续 copy 优化另行设计、发布新版 alpha。

### 0b：维护者发布与消费验收

- npm 发布、OTP、trusted publisher 配置由维护者执行；Codex 到 `release:pack` 为止。发布必须使用准确的 packed commit 和归档。
- 维护者发布后，检查 `npm view @voidmix/storage dist-tags` 和精确版本可解析；不得只凭本地 pack 成功标记 0b 完成。
- 配置 npm trusted publisher 后记录完成状态。Raypx 阶段 4a 精确 pin 已发布版本到根 catalog，由 API 声明 `catalog:` 依赖并刷新 lockfile。

## 阶段 1：Web 移动端适配和 PWA

改动范围：`apps/web`、`packages/i18n`、`e2e`，必要时修改通用 UI 原语。

1. 检查 375×812 下的账户首页、设置和全部认证页面；无横向滚动，导航与表单可操作。移动 e2e 覆盖中英文、明暗主题、长文案和表单错误，不只缩小桌面截图。
2. Manifest 包含稳定 `id`、`name`、`short_name`、`start_url: "/"`、`scope: "/"`、`display: "standalone"`；主题色来自 UI token。保留原 logo，生成 192/512、maskable 和 apple-touch-icon；root head 添加 manifest、light/dark theme-color 和适用的 iOS meta。
3. “应用外壳”仅指独立、无账户数据的静态离线页及明确列入缓存的构建资源。SW 不缓存任何 API、认证响应、用户上传、签名 URL 或 SSR HTML；导航联网读取，网络不可用时回退静态中英文“需要联网”页。HTTP 错误不能伪装成成功离线页面。
4. SW 仅生产注册，缓存按构建版本管理；明确旧缓存清理与更新策略。覆盖深链接离线、升级后资源一致性、登出/换账号后离线不出现旧账户数据。开发不注册，测试使用隔离 browser context。
5. Chromium 收到 `beforeinstallprompt` 才显示可触发的安装按钮；无事件时提供适用浏览器的安装说明。iOS Safari 提供“分享 → 添加到主屏幕”；当前 standalone 模式不重复提示。关闭选择保存在 localStorage，读写都 try/catch，不影响其他功能。

验收：`verify`、移动 e2e；生产构建检查 manifest 图标、SW 范围、缓存内容和离线回退。Android Chrome、iOS Safari 真机分别完成添加到主屏幕、独立启动及登录后使用，报告设备/浏览器版本。

不再要求“Lighthouse PWA installable 检查通过”：该检查已弃用；Lighthouse 可继续用于性能和可访问性，但不作为安装验收替代。依据：[Chrome 官方说明](https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest)。

## 阶段 2：Desktop 设备注册和任务状态同步

设备身份、撤销和连接现已由 [远程 Agent 任务](../architecture/remote-tasks.md) 的实现负责。
本节下文仍是尚未实施的 Cron job/run 摘要方案，不代表 Agent 任务能力，也不得另建一套设备绑定。

目标：登录且开启同步时，尽力上报本地任务定义摘要和近期状态；未登录、离线、同步失败都不影响本地任务。改动涉及 DB、contracts/api 与 local、client、API、Desktop、CLI、i18n 和测试基座。

本地 job/run、执行归属和变更序列与 [CLI 与桌面执行设计](cli-desktop-runtime.md) 的 M1 数据约定协调；不等待其 IPC、TUI 或独立前台调度全部完成。第一版同步 Desktop 当前选定的 profile，其他 CLI profiles 不自动合并。阶段 0、1、4a 不因此增加依赖。

### 身份、撤销与数据库

在 `raypx_foundation` 下新增：

- `device`：服务端生成的 `id`（uuid）、`user_id`（级联删除）、`installation_id`、`binding_epoch`、`status`（active/revoked）、`name`、`platform`、`app_version`、`highest_sequence`、`committed_sequence`、`last_seen_at`、`last_synced_at`、时间戳；唯一约束 `(user_id, installation_id)`。
- `device_job`：`device_id`（级联删除）、`job_id`、`name`、`schedule`、IANA `timezone`、`enabled`、`next_run_at`、`updated_at`；主键 `(device_id, job_id)`。
- `device_job_run`：`device_id`、`job_id`、`run_id`、`status`、`started_at`、`finished_at`、`exit_code`、`source_sequence`；主键 `(device_id, run_id)`，`(device_id, job_id)` 外键指向 job 并级联删除。status 与本地枚举保持一致，但 API 不暴露整个 local job/run schema。
- 同步周期及分块暂存表：保存账户绑定代次、序列、snapshotId、预计分块/记录数、已接收块及摘要、状态和过期时间；在数据库中原子判定限频、版本和提交，不依赖单实例内存锁。

运行使用固定的脱敏同步投影；本地新增 `queued` 或取消/超时原因时，显式联动该投影、远程 schema 和展示，不靠复用整个本地 schema 自动扩展。临时工具运行的 jobId 可为空，不能进入上述有 job 外键的远端记录；owner、IPC 端点及命令输出也不进入投影。

原生持久化 `installationId`，不随登出清除；按账户保存设备绑定、同步开关、序列号和待撤销操作。不得存 session cookie。服务端 `register` 按当前用户与 installationId 幂等创建/查询绑定，不迁移其他用户的所有权。

`remove` 校验账户与 epoch，原子撤销并递增 epoch，删除远端 jobs/runs/暂存数据，保留最小撤销记录。重复撤销幂等，旧 epoch 不能撤销已经重新启用的绑定。自动注册遇到 revoked 必须停止同步；只有用户在 Desktop 明确重新关联，才通过 `reconnect` 增加 epoch 并启用。

离线关闭同步立即停报，并持久化待撤销；只有原账户重新具有有效 session 时重试撤销。切到另一账户不能代它删除。待撤销未完成前，不允许同一绑定自动重新启用。

### 契约与分块协议

以下为待实现的契约形状，全部在 `contracts/api` 用 Zod 定义输入/输出、长度和错误码；不代表现有 API：

- `devices.register({ installationId, name, platform, appVersion })` → `{ deviceId, bindingEpoch, status, highestSequence, activeCycle? }`；活动周期包含 `{ sequence, snapshotId, expiresAt, status }`，用于完整重启后恢复或取消。
- `devices.reconnect({ deviceId, bindingEpoch })` → 新的绑定代次；仅显式重新关联调用。
- `devices.list({ cursor?, limit? })`、`devices.remove({ deviceId, bindingEpoch })`。
- `jobs.report(...)` 使用 `phase` 区分下表五步及取消操作，每步都携带 `{ deviceId, bindingEpoch, sequence, snapshotId }`。
- `jobs.list({ deviceId?, cursor?, limit? })` 返回任务摘要与最近一次运行；`jobs.history({ deviceId, jobId })` 按需返回最近 20 条。设备信息和同步时间单独返回，零任务设备也必须可见。

| phase  | 额外输入                                         | 服务端行为                                                                                                         |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| begin  | jobPartCount、runPartCount、totalJobs、totalRuns | 建立有界同步周期，返回 expiresAt；不改已提交任务                                                                   |
| jobs   | partIndex、jobs（最多 200）                      | 暂存定义分块；相同块相同内容重试幂等，不同内容冲突                                                                 |
| commit | 无                                               | 校验所有定义块齐全、计数一致、jobId 无重复，然后单事务 upsert 定义、删除缺失 job 及其 runs、更新 committedSequence |
| runs   | partIndex、runs（最多 200）                      | 仅对应定义已提交后处理；按 runId upsert，不因批次缺失删除历史；确认每个 job 属于该快照                             |
| finish | 无                                               | 所有运行块也成功处理后标记周期完成，更新 lastSyncedAt；重复调用返回原结果                                          |
| abort  | 无                                               | 幂等放弃尚未完成的周期、清理暂存块，允许下一周期开始；不回滚已 commit 的数据                                       |

- CLI 新增只读、脱敏、分页的本地快照读取能力，固定同一时点的任务及每任务最近 20 条可用历史，再供 Desktop 分块；不能逐页重新读取变化中的列表。快照不包含 action、命令、参数、路径或 output，读取失败不等于空快照。
- `sequence` 按绑定代次原子持久化、单调递增，启动用服务端 highestSequence 校准；不用客户端时钟当版本。相同 sequence/snapshotId 的重试内容必须相同；旧代次或低于当前已接受序列的写入不得影响新数据。
- 只有 commit 才能执行“缺失即删除”。完整空快照须明确声明零任务并 commit；commit 前缺块、断线、过期或超限不改变原定义；commit 后中断则保留已提交定义和已接收 runs，lastSyncedAt 不推进，不承诺回滚整轮。begin 不得静默覆盖另一个有效周期；放弃/过期后以更高序列重建。重启时通过 register 读取 activeCycle，若无法恢复原快照内容，先按返回标识幂等 abort，再重新采集。
- 运行块按 `(started_at, run_id)` 确定性排序，每任务只保留最近 20 条；不得让旧 running 覆盖同一 run 已确认的终态，也不得借 run 上报重建已删除 job。初始实现每轮可重发本地最近 20 条，以幂等 upsert 收敛；它不承诺补齐长时间离线期间已被本地裁剪的全部历史。
- 定义提交后、运行补传中断时，保留旧 lastSyncedAt；下轮重新采集并补齐。每个块处理和确认原子提交，响应丢失可安全重试。
- 初始边界：每请求最多 200 条且序列化请求体最多 512 KiB；每周期最多 10,000 个任务、200,000 条运行、64 MiB 有效载荷；周期有效期 30 分钟。Desktop 在 begin 前校验整轮预算，服务端逐步复核；超限返回 `SYNC_LIMIT_EXCEEDED`，按上述提交边界保留已提交数据并在设置中说明，不截断或限制本地任务运行。
- “每 10 秒最多一次”限定为创建新同步周期；已有周期的幂等重试、分块、commit 和 finish 不重复消耗该名额。块请求另按设备限制 10 次/秒、突发 20 次及上述字节预算，返回 `RATE_LIMITED` 和 `retryAfterMs`，多实例下保持一致。
- `last_seen_at` 使用服务端收到有效同步请求的时间；`last_synced_at` 表示完整同步完成，任务时间保持来源值。`next_run_at = enabled ? nextRuns[0] ?? null : null`，保留原 IANA 时区。

### Desktop 协调器与本地事件

- native 持有安装/绑定元数据、序列、5 分钟周期和事件聚合；WebView 根级协调器在路由外存活，使用现有 Better Auth session 发认证 HTTP。CLI 不依赖账户 SDK，native 不复制或持久化账户 cookie。
- 登录、启动、引擎恢复、任务增删改、运行状态变化和每 5 分钟触发同步。CLI 增加脱敏的开始/跳过/完成/中断状态变更信号，兼容现有 `job.finished` 消费者；不能只依赖任务页监听。
- 异常退出遗留的 running 只能在确认不存在活跃执行 lease 后修复为 interrupted，不能误改另一个进程仍在执行的任务。无法确认时保留来源状态并由 Web 标注陈旧。
- 同一绑定只允许一个在途周期；期间事件设置 dirty，完成后重新采最新快照。网络失败重试相同块，指数退避从 1 秒增长到最多 5 分钟并加抖动；限频至少等待 retryAfterMs。过期/版本冲突重新采集，401/撤销/代次失效停止该绑定同步，等待有效会话或显式重新关联。
- 登出、换账号、关闭同步立即取消本地队列和定时触发、忽略旧回调；服务端 epoch 与每次 session 校验阻止撤销后的迟到写入。登出本身不删除原账户已同步的数据。
- 同步开关按账户持久化、首次默认开；已关闭或被撤销的绑定不因重启恢复。离线不弹错误，设置页可查看最后成功同步时间、待撤销和超限状态。
- 隐藏窗口时托盘继续运行；原生周期必须能触发保留的 WebView 协调器。实际 Quit 取消同步并正常停止本地引擎；不得仅凭 renderer 的定时器假设隐藏窗口仍会同步。

验收：`verify`、`test:postgres`；API 覆盖越权、注册/撤销幂等、跨实例限频、201 个任务、11 个任务各 20 条历史、重复/缺失/冲突分块、空快照、超限、响应丢失、乱序重试、run 裁剪及级联删除。Desktop/CLI 覆盖一致脱敏快照、触发合并、退避、开始/跳过/中断、读取失败、A→B 换号、离线关闭后重启、撤销后迟到请求。打包态在设置页、隐藏窗口超过 5 分钟、完整重启后验证同步与 HTTPS session；未通过的平台列为开放发布门禁。

## 阶段 3：Web 任务页

改动范围：`apps/web`、i18n、e2e；业务展示放 feature 目录。

1. `/tasks` 按设备展示任务名称、启用状态、下次运行时间、最近运行状态与结束时间；展开时读取最近 20 次历史，支持列表分页。无任务设备仍显示，区分“没有设备”“设备无任务”“同步未完成”和请求失败。
2. 显示最后在线与最后完整同步时间，超过 10 分钟无有效同步请求显示离线。运行状态注明“截至上次同步”；设备离线或数据陈旧时不能把旧 running 宣称为仍在执行。时间使用用户 locale 格式化，涉及 cron 时显示来源时区。
3. 页面可见时每 30 秒轮询任务和设备摘要；隐藏时停止定时请求，恢复可见立即刷新，手动刷新复用同一请求通道。避免请求重叠；卸载/登出取消并忽略旧响应，缓存按账户隔离。已展开历史随当前刷新更新。
4. 移动导航加入“任务”；设置页列设备并支持确认后移除，说明只删除账户同步副本、停止该绑定同步，不删除本地任务。
5. 空态直接提供 Desktop 下载入口及“登录同一账户”的说明，不依赖阶段 5。开发占位不得伪装成可用下载按钮；真实发布地址是发布门禁。

验收：组件覆盖空态、零任务设备、离线/陈旧状态、分页、轮询暂停/恢复、登出与移除；`verify`；真实 API 的移动 e2e 走通“登录 → tasks → 查看历史 → 移除设备”，包含 SSR 刷新、账户隔离、中英文与 375 宽度。

## 阶段 4a：上传服务与 Web

依赖 0b、1。改动涉及 API、DB、contracts/api、client、Web、i18n 和 e2e。

### 配置与浏览器跨域接入

- 在 `env.ts` 声明 `STORAGE_DRIVER`（fs/s3，开发默认 fs）、`STORAGE_FS_ROOT`、`STORAGE_SIGNING_SECRET`（至少 32 字节）、`STORAGE_PUBLIC_BASE_URL`、S3 endpoint/bucket/region/access key/secret。fs 签名基址必须与挂载的 `/files/` 对应；生产要求 s3，默认按私有 Cloudflare R2 桶部署。
- runtime 创建 storage，单文件上限统一为 **20,000,000 字节（20 MB）**，允许图片、PDF、纯文本；签名 PUT/GET 默认有效期均为 5 分钟。
- fs handler 接入现有 Hono app，精确允许 Web 来源及 PUT/GET/HEAD/OPTIONS 和实际签名请求头；现有 CORS 没有 PUT，必须一起修改。不要新增第二个 listener。
- R2 文档给出桶 CORS：精确来源、PUT/GET/HEAD、Content-Type 和实际使用的签名头，需要读取 ETag 时显式 expose。生产 HTTPS，用户文件不设公共访问；预签名请求无需携带账户 cookie。依据：[R2 CORS 文档](https://developers.cloudflare.com/r2/buckets/cors/)。

### 对象状态、契约与配额

- `upload` 表：id、user_id（级联删除）、file_name（清洗后仅用于展示）、content_type、size、staging_key、final_key（可空）、sha256（可空）、status（pending/finalizing/ready/deleting）、active_attempt_id、lease_expires_at、put_expires_at、pending_expires_at、created_at、ready_at；对象 key 仅由服务端生成。
- `upload_finalize_attempt` 保存 uploadId、attemptId、唯一 finalKey、租约及清理状态。先写台账再执行存储 I/O，保留失败/未知结果供清理；不能只保留最后一次尝试的 key。
- `uploads.create({ requestId, fileName, contentType, size })` 幂等预留配额，新建时返回 uploadId 和 staging key 的签名 PUT 请求。requestId 按账户唯一，同 key 不同参数冲突；重试不得重复扣配额。重复 create 返回现有记录状态：仅未过期 pending 可返回有效 PUT 请求或引导 renew，finalizing/ready/deleting 返回对应状态或既有结果，不重新签发写入权限。
- `uploads.renew({ id })` 仅对未过期 pending 续签，更新最晚 PUT 有效时间；不延长 24 小时未完成期限。ready/finalizing/deleting 不再签 PUT。
- `uploads.complete({ id })` 执行下文确认流程；重复请求返回同一个 ready 结果，正在处理返回可识别状态。`uploads.get({ id })` 用于处理状态/完成响应丢失后的查询。
- `uploads.list({ cursor?, limit? })` 只列 ready；未完成项通过 get/客户端队列显示。`uploads.download({ id })` 仅 ready 可用，返回短期签名 GET、清洗后的文件名、大小与 SHA-256；`uploads.delete({ id })` 幂等进入 deleting。
- 初始可配置配额：每账户逻辑容量 1,000,000,000 字节、最多 1,000 个文件/预留槽位、pending+finalizing 最多 10 个、create 最多 60 次/小时。create 在短事务内原子预留，ready 转已用，清理达到释放条件后才归还，不能重复释放。
- 所有 RPC 验证 session 与归属，不信任客户端传入 storage key、userId、下载源或文件路径。大小与类型校验在服务端重复执行；HEAD 的 content-type 是对象元数据，不能声称它证明文件字节的真实格式。下载使用 attachment，文件名去除控制字符和路径部分。

### 确认、删除与清理流程

1. 客户端 PUT 只写 `users/<userId>/uploads/<uploadId>/staging`；最终对象 key 为同一 upload 下唯一 attempt 路径，从不向客户端签发最终对象的 PUT。
2. complete 在短事务中领取 60 秒 finalizing 租约、创建唯一 attempt/key；事务外先 head 核对存在、大小和类型，再 get 有界读取，校验精确字节数、计算 SHA-256，以现有 put 写最终对象。确认阶段 API 会中转最多 20 MB 文件内容，不记录内容；不持有数据库锁跨存储网络请求。
3. 仅当前仍有效的 attempt 能通过比较并更新（CAS）将记录置 ready、选定 finalKey/hash；删除、过期或被替换的 attempt 不得提交。失败重试使用新的 final key，旧写入晚到也不能覆盖已经 ready 的文件。
4. 每实例最多两个未结束的 complete 存储操作；超时但底层 PUT 未结束仍占槽位。现有 storage 没有取消 PUT 的契约，不能把应用超时当成底层取消成功。失败结果和待清理对象保留台账。
5. delete 先标 deleting，阻止新的下载签名和 complete 提交，再异步删除 staging、ready final 和所有尝试对象。已发出的 GET 是短期 bearer URL，不能承诺立即撤回；对象删除前可能仍有效。
6. runtime 启动每 15 分钟一次、每批 100 条的清理任务，Nitro close 时停止；用数据库租约避免多实例重复领取。pending/finalizing 超过 24 小时转清理；删除失败保留记录并重试，不能仅依赖用户访问 list。
7. 释放配额须确认已知对象删除成功且签名/有效尝试窗口结束。保留必要墓碑，并周期性分页扫描上传命名空间中的孤儿对象，处理“清理后旧 PUT 才落地”。活跃 staging、当前 attempt 和 ready final 不得误删；账户删除后的对象也纳入回收。
8. 这是逻辑容量配额；staging、复制和待清理对象会暂时占用额外物理空间。24 小时表示开始过期回收，不能在存储不可用时承诺精确物理删除时间。

### Web

- `/uploads` 提供普通文件选择入口（accept 图片/PDF/文本），另提供拍照入口（image/*、capture="environment"）；不能让 capture 替代相册和文档选择。导航在窄屏可达。
- 前端按精确字节上限和允许类型拦截，显示中英文提示；服务端仍是最终校验方。`XMLHttpRequest` 显示上传进度，PUT 后另显示“正在确认”，仅 complete ready 才刷新成功列表。
- 上传失败可重试同一 pending，签名过期续签；complete 响应丢失先 get/重试 complete，不能重复 create。文件内容不写浏览器持久存储；刷新或退出后的临时上传由服务端回收。取消中止 XHR，并请求 delete。

验收：`verify`、`test:postgres`；覆盖越权、配额并发、create/complete/delete 幂等、签名过期、对象不存在、大小/元数据类型不符、续签、超时旧 attempt、删除与 PUT/complete 并发、清理失败及孤儿回收。真实 fs 浏览器 e2e 完成“登录 → 选文件 → 上传 → ready → 列表 → 下载字节/hash 一致 → 删除”。隔离 R2 桶通过真实浏览器验证 CORS、20 MB 边界、签名头一致性、过期与篡改拒绝、确认/下载/清理；未实测时不得宣称生产存储链路通过。

## 阶段 4b：Desktop 取回文件（必做）

依赖 4a。现有 `files.write` 仅支持最多 1 MiB UTF-8 文本，NDJSON 单消息上限 8 MiB；不能把文件编码进一次 text 写入。下载采用快速确认和状态查询，新控制请求端到端目标在 5 秒内结束，不能让 bridge 等待整个下载。

长操作确认、状态和取消语义与 [CLI 与桌面执行设计](cli-desktop-runtime.md) 的 M1/M2 保持一致；可以先通过现有私有 stdio 实现，不强依赖所有平台的 IPC 或 TUI。新增 transfer 仍为独立类型，签名 URL 不持久化到通用运行/幂等记录。

1. Desktop 文件 feature 增加“从手机上传的文件”，通过账户 API 列 ready 文件。用户主动选择下载、现有 root grant 和目标相对路径；授权新目录仍使用 native picker。
2. `contracts/local` 和 CLI 设计新的 `files.download.start/status/cancel`（拟定名称），不注册到远程 RPC。start 快速返回 transferId，status 提供字节进度/完成/错误；大文件字节不经过单条 NDJSON 消息。
3. renderer 取得短期 GET、size/hash 后交 native 校验，再启动本地下载。只允许应用配置的 API/R2 HTTPS origin，拒绝重定向；开发 loopback 显式单列。可信启动配置决定允许来源，不能让调用参数自带任意 allowlist。CLI 不接账户 cookie、不依赖账户 SDK，签名 URL 只在本次传输内存中使用。
4. CLI 将二进制流写入授权目标同目录的私有临时文件，强制 20,000,000 字节上限、精确预期长度与 SHA-256。写入前和提交前复核 root grant、路径、符号链接及文件版本，成功后原子提交。
5. 默认 `expectedVersion:null` 表示新建，重名报冲突；覆盖需用户明确选择并使用当前版本，不能静默覆盖或拼接客户端原始文件名。无效文件名要求重新选择合法 basename。
6. cancel、EOF、Quit、引擎退出中止传输并清理临时文件；异常重启清理由本功能创建的残留。失败/取消不破坏已有目标文件。签名过期后重新获取并从头重试，不实现断点续传。

验收：CLI 测试临时 root grant 下图片/PDF/文本的字节/hash 一致、20 MB 边界、hash/长度不符、未授权根、路径穿越、符号链接、授权撤销、重名/覆盖竞态、取消/退出/失败清理；Desktop 测试列表、进度、取消和重试；`verify`。macOS/Windows 打包态完成“手机上传 → Desktop 登录 → 选授权目录 → 下载并校验”，同时验证超过 5 秒的传输不会因 bridge 超时失败。浏览器 renderer mock 不能替代本门禁。

## 阶段 5：首次使用引导

依赖 1、2、4b。改动范围明确包含 DB、contracts/api、API、client、Web、i18n 和 e2e；现有 theme/locale 是设备偏好，不能用它们保存账户级关闭状态。

1. 新增账户 onboarding 状态，包含 version、dismissedAt、首次设备注册与首次 ready 上传的里程碑；通过 session 鉴权的 `onboarding.get/dismiss` 读写。里程碑由服务端成功操作记录，不接受客户端直接宣称已完成。
2. 阶段 5 上线时为已有账户依据现存设备/ready 上传初始化可证明的里程碑，无法证明的不伪造历史。之后删除设备或文件不抹去已发生的首次成功里程碑。
3. 登录后未关闭且必需步骤未完成时显示清单，不再用“当前无设备且无上传”作为持续展示条件。完成一项继续显示其他项；必需步骤为 Desktop 已注册和首个文件 ready，两者完成后收起。
4. “下载 Desktop”是操作入口，不把点击算下载/安装成功；“Desktop 已就绪”由设备注册证明。发布前必须有真实可用的下载地址与平台包，开发占位标明不可用。
5. PWA 安装是可选的当前设备步骤，使用当前 standalone/appinstalled 等可观察信号；不能可靠检测时显示安装说明，不标为账户所有设备均已安装，也不阻止必需步骤完成。安装提示的本地关闭与整个清单的账户级关闭分别处理。
6. 关闭必须服务端保存成功后确认，失败可重试；换浏览器读取相同账户状态。登出/换号清理或隔离缓存，晚到响应不能更新另一账户界面。

验收：组件覆盖首次、部分完成、pending 不算完成、全部完成、关闭失败重试、删除资源不重置里程碑、可选安装状态；`verify`、`test:postgres` 覆盖鉴权/账户隔离和里程碑幂等；真实浏览器 e2e 覆盖同账户两个 context 的关闭一致性、另一账户不受影响、上传/注册后清单继续展示未完成项。

## 阶段 6（可选，前面阶段稳定后单独设计）

- 失败通知默认关闭，采用 Web Push/VAPID；实施时重新核对目标浏览器支持条件，iOS 说明适用系统版本和添加到主屏幕要求。
- 订阅按账户保存并处理失效/退订；只在新失败 run 成功写入时去重入队，分块重试或旧历史补传不得造成重复通知。
- 推送发送与 report 事务分离，失败不影响同步。进入本阶段前另行确定订阅、去重、隐私文案和验收，不随 1—5 自动实施。

## 交付要求

- 每个实现阶段独立提交，Conventional Commits；0a/0b、4a/4b 按上述交付边界报告。发布、真机验收可以补报告，不为无代码步骤制造空提交。
- 接口实际变化时更新受影响 workspace 的 `AGENTS.md` 与 `docs/architecture/README.md`；方案修订本身不提前把架构文档写成已实现。
- 阶段报告列：文件和接口变化、实际命令与结果、未跑检查及原因、外部前置、开放发布门禁、遗留问题。明确区分 mock、真实后端、打包态和真机证据。
- 首次可发布版本必须具备真实 Desktop 下载资产、手机安装记录、R2 实测以及目标 Desktop 平台验收。只完成代码或 verify 不能关闭这些门禁。

## 默认值与本次审阅确定的调整

| 问题           | 默认                                                          |
| -------------- | ------------------------------------------------------------- |
| Web 状态刷新   | 30 秒轮询，后台暂停，恢复可见立即刷新                         |
| Desktop 同步   | 状态变化触发＋每 5 分钟；每绑定一个在途周期                   |
| 新同步周期限频 | 每设备 10 秒最多一次；分块另有限额                            |
| 定义/历史同步  | 定义分块收齐后原子替换；运行分批幂等 upsert，每任务最近 20 条 |
| 隐私字段       | 不上传 output、action、命令参数或文件路径                     |
| 设备身份       | installationId 持久化；账户绑定独立，撤销后显式重新关联       |
| 生产存储       | 私有 Cloudflare R2，staging 确认后复制到唯一 final 对象       |
| 单文件上限     | 20 MB，即 20,000,000 字节，所有层一致                         |
| 账户逻辑配额   | 1 GB、1,000 个文件/预留槽位、10 个未完成上传                  |
| 文件类型       | 图片、PDF、纯文本                                             |
| URL/未完成期限 | PUT/GET 5 分钟；未完成 24 小时后进入回收                      |
| Desktop 取回   | 必做；二进制异步流式下载，root grant 约束，默认不覆盖         |
| 首次使用       | 账户级关闭；Desktop 注册和首个 ready 上传是必需步骤           |
| 手机控制任务   | 不支持；只读状态                                              |

这些是方案修订后的实施默认值；如需改变，在对应实现阶段开始前说明原因与验收影响，不静默替换。
