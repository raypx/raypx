# 2026-10-24 审查治理记录

基线为 canary `c0fe578` 及实施开始时的工作区。保留全部既有暂存、未暂存改动；没有提交、推送或部署。`raypx-kit` 没有确认缺陷，本次不修改。

## 确定策略

- 会话管理设置 `freshAge: 0`，保留有效登录、撤销授权及可信 Origin 校验，不额外要求重新验证。
- 最终任务及每个 activity 的最新正文保留到主动清理；重复修订和回放属于有界缓存。本地清理只作用于本地任务。
- Web、API、Desktop 和内置 CLI 统一使用 relay v2。版本不匹配明确返回 `UPGRADE_REQUIRED`，停止无效重连。
- 数据库只新增兼容索引，先迁移再切换 API；保留单 API 进程架构。
- “已修复”表示代码和列出的自动化证据；平台和外部服务验收另列，未运行不计通过。

## 高、中优先级销账

| 编号                                    | 处理结果                                 | 实现与证据                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H1 会话超过 24 小时无法读取             | 已修复                                   | `packages/auth/src/server.ts` 显式 `freshAge: 0`；`packages/auth/tests/session-security.test.ts` 在生产 Cookie 配置下验证 48 小时旧会话可读、匿名拒绝、撤销有效。账户组件区分未登录、权限及网络错误，提供重试和登录入口。                                                      |
| H2 本地正文重复、无限 journal           | 已修复                                   | `AgentStore.recordActivity` 对 `desktop:` 仅写最终投影；启动分批删除旧 activity journal，保留状态及审批历史。Recorder 达到 32k 截断且内容未变时停止重复保存。CLI store/activity 回归验证长流、旧数据迁移及保留历史。                                                           |
| H3 云端读放大及账户锁                   | 已修复                                   | `ControlRepository.read` 使用只读事务，不持有 owner 写锁；`getTask` 在 SQL 按用户、任务、游标、分页范围取数。类型化通知直接合并正文，活动增量不刷新设备、任务列表或审批计数。真实 PostgreSQL 用独立连接持写锁时仍可读取；6000 条无关正文下命中任务 activity 索引，无全表扫描。 |
| M1 云端 activity 回收                   | 已修复，调整原报告推论                   | 每条 activity 只保留最新投影；非 activity 回放按 4096 条和 8 MiB 回收，清除旧 stream 回放及无主事件。不因部分快照缺项删除正常历史。原报告把本地 `forget` 视为云端删除信号，与确定的保留策略不符，未采用。API 回归验证窗口、无主数据和快照外最终历史。                          |
| M2 hunk 内特殊前缀丢失                  | 已修复                                   | 只在首个 `@@` 前识别文件头；覆盖 `--- drop x`、`+++ x`、无行号 hunk 及后续行号。见 `packages/tasks/tests/approval-changes.test.ts`。                                                                                                                                           |
| M3 新增、删除文件语义                   | 已核实并修复                             | 按 Codex `kind.type` 的 add/delete/update 解释整文件或统一 diff；混合未知结构退回整个原始请求，避免遗漏部分文件。Claude Write 缺少旧内容时标注“写入／覆盖，原内容未知”。官方 App Server 文档及本机生成 schema 已核对，真实推理验收另列。                                       |
| M4 JSON 切换目标串用密钥                | 已修复                                   | `mergeAiSettings` 集中合并：切 provider 清模型、地址、协议、凭证及上限；切 endpoint 清凭证、认证方式及上限；显式 JSON 最后应用，同目标继续逐字段覆盖。配置单测和 CLI 回归覆盖。                                                                                                |
| M5 Codex 用量归属                       | 已核实并修复                             | 按线程累计 total 的差分归属轮次，保存线程续接基线；忽略重复、降低及旧 turn 通知，无可靠基线显示未知。activity 回归使用多次累计用量，fixture 同步升级。真实 Codex 账单对照未运行。                                                                                              |
| M6 Claude steer 无 result、自然结束竞态 | 已修复                                   | 中断确认后最多等待 10 秒；超时结束不确定执行、收尾输入并释放项目锁，不重发推理。自然结束依据实际 result 判断。interactive fixture 覆盖无 result、自然完成交叉及后续锁释放。                                                                                                    |
| M7 Windows 会话损坏阻止启动             | 代码已修复，Windows 实机未验证           | 文件损坏或缺密钥时隔离旧文件并登出启动，显示恢复路径；密钥服务暂时不可用时只用内存且保留原密文。假 KeyStore 回归覆盖 GCM 失败、截断、版本错误、缺密钥、短暂服务故障与恢复；不能替代 Windows CEF 打包验收。                                                                     |
| M8 4001 无退避及续期丢回调              | 已修复                                   | 4001 和 AUTH_REQUIRED 共用续期状态机，500ms 至 30 秒指数退避并抖动，成功同步后才重置。主动续期待所有在途命令收尾后切连接；意外断线使用持久化回执恢复。native control 回归覆盖连续拒绝、两种认证错误入口和在途命令。                                                            |
| M9 共享网络及伪造转发 IP                | 代码与本地代理规则已修复，真实代理未验证 | 入口改为项目专属网络，仅连接 Traefik/Web/API，数据库仍在 backend。Node 从真实 socket 校验可信代理，按右至左可信链解析 XFF，覆盖其他容器伪造头。文档要求精确代理地址及 Traefik `forwardedHeaders.trustedIPs`；缺 Docker/真实 HTTPS 环境，容器网络与边缘代理验收不计通过。       |
| M10 迁移与旧 API 并存                   | 已修复部署约定及脚本，容器实测受限       | 两个 Drizzle 生成迁移只增加索引；旧 API 可继续读取。`deploy/update.sh` 顺序为校验、Postgres、迁移、API、Web；模拟 Docker 回归确认迁移失败不会执行 API 替换。真实镜像及 Compose 启动未运行。                                                                                    |

## 低优先级及扩展要求销账

| 项目                         | 处理结果与证据                                                                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 显示名与账户 React key       | 服务端统一 trim 后校验 1–80 字符；profile/session 使用不同 key。useSession 失败显示加载、错误及重试，不再静默隐藏会话区。                                                                                                                                                                   |
| 生产 Cookie CSRF             | `update-user`、`revoke-session`、`revoke-other-sessions`、`revoke-sessions` 拒绝缺失及外部 Origin；保留 `views://main`。认证回归使用生产配置，真实 HTTPS Cookie 行为另列。                                                                                                                  |
| relay v2 生命周期            | 完整 activity 保留；追加消息携带 entryId、baseRevision、revision；首次、替换及结束发送完整条目。基线不匹配拒绝增量并请求快照。共享 reducer 与 API 测试验证缺基线、重复增量及最终完整条目的权威性。                                                                                          |
| 回放及 outbox                | 本地每 binding 同时限制 4096 条、8 MiB；outbox 通过 journal ID 引用正文。启动也压缩已有远程缓存；窗口缺口转快照，重复 ACK 幂等。长流测试验证线性传输量和不复制 outbox 正文。                                                                                                                |
| 页面恢复历史缺口             | 恢复可见时检测前后页断层，显示补载入口；快照使用有界连续片段并标注不完整，活动中的基线优先保留。Web 回归覆盖正文实时合并、缺基线恢复及中间历史补载。                                                                                                                                        |
| 追加指令按钮、提交、快捷键   | 共用发送条件，pending/cancelling/busy 和不支持的模式均不可发送。Web 组件覆盖 Ctrl/Cmd+Enter 和表单提交。                                                                                                                                                                                    |
| Codex steer 竞态             | 仅明确未接收的过期 expectedTurn 错误可进入队列；其他失败保留失败状态。CLI fixture 覆盖过期 turn，禁止不确定重发。                                                                                                                                                                           |
| 旧进程回调归属               | 正常及失败回调均校验当前进程归属，包含 Claude 计划续接；旧回调不能结束新执行。                                                                                                                                                                                                              |
| 多块文本及无 itemId          | Claude 流式和最终多文本块统一换行分隔；Codex 缺少 itemId 时复用当前消息身份，避免重复条目。activity 单测覆盖。                                                                                                                                                                              |
| 离线 provider/model 目录     | `ai providers` 不读 TOML，保留四个默认 provider；`ai models` 仅采用命令显式 provider 筛选。损坏 TOML 不影响目录。                                                                                                                                                                           |
| SDK 产物及包体积             | 独立 CLI 在空 PATH、仓库外运行；生产 JS/chunk 离线 harness 覆盖 anthropic/openai/google/openrouter 初始化到传输层，未调用外部推理。`dist/provider-smoke.json` 记录 binaryBytes/bundledJsBytes：本次 macOS arm64 二进制 101,742,050 字节，JS 共 1,922,118 字节。保留 Google。                |
| Native Cookie 批次           | 所有 Set-Cookie 先校验再提交；加密 jar 原子保存，SDK 失败回滚；回滚返回失败或抛异常都禁用该会话发送。API 单测覆盖域、属性、部分写入及回滚异常。                                                                                                                                             |
| Native 取消及超时            | renderer 请求 UUID 和 apiCancel 传给 native AbortController，native 统一 30 秒总超时（包括响应 body）。跨桥不返回 Cookie，非幂等操作超时不自动重试。renderer/native 单测覆盖取消、预取消及目标限制。                                                                                        |
| 多实例会话写入               | 用户数据目录增加独占 PID/随机 token 锁，存活实例不可抢占，退出只释放自己的锁。锁逻辑单测通过；Windows 实机仍未验证。                                                                                                                                                                        |
| 外链与 CSP                   | Native 只允许校验后的无凭证 HTTP(S) URL 打开系统浏览器；renderer 捕获外链。打包 main 页面使用启动脚本 hash，禁用任意 inline/eval 脚本；关闭页 deny-all。CSP 单测及 macOS 打包 IPC、主题、终端冒烟通过。系统浏览器实际外链打开未单独验收。                                                   |
| 自动化目录及删除翻译         | 首次目录可用自动选择首项，保留已有选择；删除标题使用中英文完整翻译。Desktop 组件和 E2E 保留真实选择流程。                                                                                                                                                                                   |
| 确认框并发                   | 不同确认请求 FIFO 排队；同一 requestKey 复用待决 Promise，卸载统一取消。UI 组件验证排队、复用、独立答案和卸载。                                                                                                                                                                             |
| 下拉测试稳定性               | 组件环境关闭过渡；helper 等待弹层可交互，并验证触发器选中值及关闭状态，业务结果仍有断言；E2E 保留真实动画。原报告“动画导致失败”的解释没有得到独立因果证明，不记录为已确认根因。                                                                                                             |
| release、Postgres 及迁移镜像 | build.sh 在调用 Docker 前校验 release/tag 长度。Compose 要求显式 PostgreSQL sha256 digest，无浮动 fallback；实际生产 digest 尚未从 registry 验证，必须部署前填写。迁移依赖层仅接收工作区 manifests/lock，源码后置，最终镜像只含 DB 必需源码及迁移。脚本和 manifest 回归通过，镜像实测受限。 |

## 验证记录

运行使用 Bun 1.4.4、Node 24.15.0；数据库为临时隔离的 PostgreSQL 17.11 和 Redis 8.8，测试结束已停止并删除临时数据。没有连接旧产品或生产数据库。

| 验证                                                  | 结果                                                                                                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run verify`                                      | 最终通过：47/47 个 Turbo 任务；API 82、CLI 159、Desktop 131、Web 59 项测试通过。Node/Cloudflare/独立 CLI 产物冒烟通过，含四个默认 provider 的编译加载检查。                      |
| `bun run --cwd apps/api test:postgres`                | 13/13 通过；包含独立写锁读取、6000 条无关正文索引检查及增加式迁移。                                                                                                              |
| `bun run --cwd apps/api test:redis`                   | 通过，隔离实例。                                                                                                                                                                 |
| `bun run --cwd apps/api test:postgres:cloudflare`     | 4/4 通过，直接 Postgres 与本地 Hyperdrive/workerd 两种模式。不是 Cloudflare 线上验收。                                                                                           |
| `bun run test e2e`                                    | 21 通过、2 跳过。跳过真实后端 relay 场景及真实推理 beta 场景；前者未提供 CONTROL_E2E_API_URL，后者未提供专用 HTTPS 账户和 native 环境。                                          |
| `bun run --cwd apps/desktop native:smoke`             | macOS arm64 shell、切换服务器后 restore、切回原服务器 restore 三阶段通过；验证实际打包资源、IPC、终端、托盘、CLI 及主题/语言恢复。使用本地 synthetic fixture，不计真实认证通过。 |
| Windows CEF / Credential Manager                      | 未验证；没有 Windows 打包运行环境。假密钥服务单测不计平台通过。                                                                                                                  |
| Compose config / 镜像构建 / Traefik 容器代理          | 未验证；本机 Docker 可执行链接失效，没有可用 daemon。仅模拟 Docker 顺序、shell 语法及本地 IP 解析测试通过。                                                                      |
| 真实 HTTPS / Cloudflare 边缘 / SMTP / 外部 Agent 推理 | 未验证；未提供隔离的服务环境，未使用个人凭证或消耗真实推理。                                                                                                                     |
| 官方 PostgreSQL manifest digest                       | 尚未验证；registry 访问未成功。部署配置现在强制显式指定 digest，空值无法启动。                                                                                                   |

本地执行日志在 `/tmp/raypx-remediation-verify.log`、`/tmp/raypx-test-postgres.log`、`/tmp/raypx-test-redis.log`、`/tmp/raypx-test-postgres-cloudflare.log`、`/tmp/raypx-remediation-e2e.log`、`/tmp/raypx-remediation-native.log`、`/tmp/raypx-remediation-package.log`、`/tmp/raypx-remediation-dmg.log`。这些临时日志不是长期产物。

## 协议及部署依据

- [Codex App Server 官方文档](https://developers.openai.com/codex/app-server/)：增量只构造流式预览，最终完整 item 为权威结果；本机生成协议 schema 核对 FileUpdateChange add/delete/update 和 tokenUsage.total/turnId。
- [Traefik EntryPoints 官方配置](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/)：代理入口的 forwardedHeaders.trustedIPs 必须由实际网络和边缘地址配置，不能把共享 Docker 网段作为客户端可信边界。
