# 执行方案：raypx-kit（参照 next-forge 补齐能力占位）

> 交给 Codex 执行。基线：raypx-kit `canary` 40cd525，raypx `main` cc7b9e3。
> 参照：vercel/next-forge `main` 的 `apps/`（api、app、docs、email、storybook、studio、web）
> 和 `packages/`（20 个能力包）。

## 定位

raypx-kit 是一个**自用**的独立仓库（`raypx/raypx-kit`，默认分支 `canary`），收纳**通用、
稳定、少改**的逻辑，npm scope 为 `@raypx-kit/*`。raypx 通过 npm 固定版本使用它。

当前状态（2026-10-20）：codemods、devkit、drizzle、drizzle-kit、env、intl、logger、storage、
tsconfig 九个包已发布 `0.0.0-alpha.0`，并配置 trusted publisher，之后由 CI 自动发版。
raypx 已改用 `@raypx-kit/*`，只有 logger 仍是 `@voidmix/logger` 的 vendor 归档（见下方
logger 一节）。旧的 `@voidmix/*` 包保留在 npm 上、不做 deprecate；voidmix 仓库待归档。

## 和 next-forge 的关键区别（所有包都必须遵守）

next-forge 的每个能力包直接绑定一家供应商（Clerk、Stripe、Sentry、Upstash……），并在
导入时读取环境变量。raypx-kit 的做法：

1. **接口加驱动**：每个包导出一个与供应商无关的接口和 `createXxx(driver, options)`，具体
   供应商以独立入口提供驱动（例如 `@raypx-kit/storage/s3`）。参考 `packages/storage`。
2. **依赖注入**：不在导入时读取环境变量，不创建单例，不发起网络请求。配置全部由调用方传入。
3. **自带内存或空驱动**：每个包都提供 `memory` 或 `noop` 驱动，用于测试和本地开发。
4. **不含产品逻辑**：不出现 raypx 的文案、数据结构、路由和品牌。
5. **能在 Cloudflare Workers 上运行**：raypx 的 api 已支持 Workers，除明确标为 Node 专用的
   入口（如 `@raypx-kit/storage/fs`）外，不使用 `Buffer` 等 Node 专属 API；字节编码参考
   `packages/storage/src/internal/encoding.ts`。在 devkit.config.ts 里用 `entryTargets` 标出 Node 专用入口。
6. 遵守现有仓库约定：ESM、exact 依赖版本、`exports` 指向 `dist`、`check-packages.ts` 的
   Bun 和 Node 消费者检查、文档注册到 `docs/src/lib/pages.ts` 和 `source.ts`、根 README 包表格。

## 准入规则

进入 raypx-kit 必须同时满足：

1. 不依赖 raypx 的业务逻辑、文案和数据结构；
2. 公开 API 已经稳定，预计几个月内不会频繁改动；
3. 有自己的测试，可以脱离 raypx 单独验证。

还在快速变化的代码留在 raypx，稳定后再迁入。把这三条写进 raypx-kit 的根 `AGENTS.md`
和 `README.md`。

## 能力对照表

状态说明：**已有**＝已发布；**完成**＝代码已写好待发布；**迁入**＝从 raypx 搬入；
**占位**＝本方案新建，只有接口、内存或空驱动、测试和 README；**不做**＝不属于 kit。

| next-forge 包             | raypx-kit 对应                                 | 状态 | 备注                                                       |
| ------------------------- | ---------------------------------------------- | ---- | ---------------------------------------------------------- |
| typescript-config         | `@raypx-kit/tsconfig`                          | 已有 |                                                            |
| next-config               | `@raypx-kit/devkit`                            | 已有 | 我们用 Vite+，没有 Next 配置                               |
| database                  | `@raypx-kit/drizzle`、`@raypx-kit/drizzle-kit` | 已有 |                                                            |
| internationalization      | `@raypx-kit/intl`                              | 已有 |                                                            |
| observability             | `@raypx-kit/logger`                            | 已有 | raypx 尚未迁移，见 logger 一节；错误上报见 `observability` |
| storage                   | `@raypx-kit/storage`                           | 已有 | 已去掉 Buffer；R2 驱动待 Web 手机端阶段 4 时补             |
| email                     | `@raypx-kit/mail`                              | 迁入 | 只迁传输层，模板留在 raypx                                 |
| security                  | `@raypx-kit/security`                          | 新建 | CSP 生成和 HTTP 安全头；raypx 的 api 和 desktop 都需要     |
| rate-limit                | `@raypx-kit/rate-limit`                        | 占位 | Web 手机端方案阶段 2 需要                                  |
| notifications             | `@raypx-kit/notify`                            | 占位 | Web 手机端方案阶段 6 需要（Web Push）                      |
| webhooks                  | `@raypx-kit/webhooks`                          | 占位 |                                                            |
| feature-flags             | `@raypx-kit/flags`                             | 占位 |                                                            |
| analytics                 | `@raypx-kit/analytics`                         | 占位 |                                                            |
| observability（错误上报） | `@raypx-kit/observability`                     | 占位 |                                                            |
| ai                        | `@raypx-kit/ai`                                | 占位 |                                                            |
| payments                  | `@raypx-kit/payments`                          | 占位 |                                                            |
| seo                       | 不做                                           |      | 属于 Web 应用，放在 raypx                                  |
| auth                      | 不做                                           |      | Better Auth 集成属于产品，留在 raypx                       |
| design-system             | 不做                                           |      | 组件和 token 留在 raypx 的 `@raypx/ui`                     |
| cms、collaboration        | 不做                                           |      | 目前没有需求                                               |

next-forge 的 apps 对应关系：`app`、`web`、`api` 对应 raypx 的 web 和 api；`email`
（邮件预览）、`storybook`（组件展示）、`studio`（数据库浏览）合并为 raypx 的本地开发工具
`apps/devtools`（另见文末）；`docs` 对应 raypx-kit 现有的 docs 站点。

## 占位包的统一要求

“占位”不是空目录，每个占位包必须包含：

1. `package.json`：`"private": true`（**占位期间不发布到 npm**），版本 `0.0.0-alpha.0`，
   结构和 `packages/storage` 一致；第一次有真实使用方时再去掉 `private` 并按首次发布流程发布。
2. `src/index.ts`：公开接口类型、`createXxx(driver, options)`、错误类型（带 `code` 的
   `XxxError`，参考 `StorageError`）。
3. 一个 `memory` 或 `noop` 驱动入口，以及对应测试，覆盖接口的全部行为。
4. `README.md`：第一行写明“占位：接口已定义，尚无生产驱动”，列出计划支持的驱动。
5. `AGENTS.md`、`CHANGELOG.md`（写明初始占位）、`LICENSE`，并在 docs 站点注册。

`scripts/check-packages.ts` 已经跳过 `private` 包（`if (manifest.private) continue;`），
但 `release:plan` 和 turbo 的 build、test 仍会覆盖它们，测试必须通过。

## 各包接口草案

以下是最小接口，Codex 可以在不改变语义的前提下调整命名。

### `@raypx-kit/rate-limit`（占位，优先级最高）

- 第一个驱动用 PostgreSQL（Node 和 Workers 都能用）；`memory` 驱动只用于测试，Workers 上
  不同请求可能落在不同实例，内存计数起不到限流作用。也可评估 Cloudflare 的限流绑定。

- `createRateLimiter(store, { limit, windowMs })` 返回 `consume(key): Promise<{ allowed, remaining, resetAt }>`。
- 驱动：`memory`（固定窗口，测试可注入 `now`）。计划中的驱动：PostgreSQL、Redis。

### `@raypx-kit/notify`（占位）

- `createNotifier(channels)`，`send({ recipient, title, body, url?, tag? })`，按渠道分发并汇总结果。
- 驱动：`memory`（记录发送内容）。计划中的驱动：Web Push（VAPID）、邮件（通过 `@raypx-kit/mail`）。

### `@raypx-kit/mail`（迁入）

- 从 raypx `packages/mail/src/server.ts` 抽出与模板无关的部分：`Mailer` 接口、`createMailer(transport)`、
  `available` 标记、`memory` 驱动和 `resend` 驱动。
- raypx 的 `@raypx/mail` 改为依赖 `@raypx-kit/mail`，只保留模板和渲染。迁移在 raypx 里单独提交。

### `@raypx-kit/security`（新建，可直接发布）

- `buildCsp(directives)`：把指令对象序列化成 CSP 字符串，校验指令名和来源格式。
  raypx 目前没有 CSP（之前在 Tauri 分支上写过，已随分支删除），需要时在 raypx 里接入。
- `securityHeaders(options)` 返回一组 HTTP 安全头（CSP、HSTS、Referrer-Policy、
  X-Content-Type-Options 等），以及一个 Hono 中间件入口 `@raypx-kit/security/hono`。
  Hono 作为 optional peer dependency。

### `@raypx-kit/webhooks`（占位）

- `signPayload(secret, body, timestamp)`、`verifyRequest(secret, request, { toleranceSeconds })`，HMAC-SHA256。
- `createDispatcher(transport, { retries, backoff })` 用于发送，驱动：`memory`、`fetch`。

### `@raypx-kit/flags`（占位）

- `createFlags(provider, definitions)`，`evaluate(flag, context)` 返回带类型的值。
- 驱动：`static`（来自对象）、`memory`（测试中可修改）。

### `@raypx-kit/analytics`（占位）

- `createAnalytics(sink)`，`track(event, properties)`、`identify(userId, traits)`，内置批量和关闭时刷新。
- 驱动：`noop`、`memory`。计划中的驱动：PostHog。

### `@raypx-kit/observability`（占位）

- `createErrorReporter(sink)`，`capture(error, context)`；和 `@raypx-kit/logger` 配合，不重复实现日志。
- 驱动：`noop`、`memory`。计划中的驱动：Sentry。

### `@raypx-kit/ai`（占位）

- 只定义与模型供应商无关的最小接口：`createModelClient(provider)`，`generate` 和 `stream`（返回
  `ReadableStream`），消息和工具调用的类型。
- 驱动：`mock`（回放预设响应）。暂不引入 Vercel AI SDK，等真实需求出现再决定。

### `@raypx-kit/payments`（占位）

- `createPayments(provider)`：`createCheckout`、`getSubscription`、`verifyWebhook`（复用 `@raypx-kit/webhooks`）。
- 驱动：`memory`。计划中的驱动：Stripe、Paddle。

## 执行阶段

每个阶段单独提交，阶段末在 raypx-kit 根目录跑 `bun run verify`；涉及 raypx 的阶段在 raypx
里也跑 `bun run verify`。npm 发布和 OTP 由维护者执行，Codex 只做到 `bun run release:pack`。

1. **定位与规则**：更新 README、`AGENTS.md`、docs 首页，写入定位、准入规则和本对照表；
   更新各 package.json 的 `repository`、`homepage` 字段为新仓库地址（待维护者在 GitHub 改名后生效）。
2. **logger 迁移（raypx 侧）**：`@raypx-kit/logger` 直接暴露 evlog 的 API，而 raypx 用的
   `@voidmix/logger` 是带安全策略的运行时封装（字段白名单、敏感字段过滤、16 KiB 事件上限、
   有界队列、`/node` 的 stderr drain）。迁移时把这些策略用 evlog 的 `redact`、drain pipeline
   和 raypx 内的小适配层实现，改 api（Node 与 Workers 运行时、oRPC 日志插件）和 cli 的日志初始化，
   保留现有测试覆盖，然后删除 `vendor/`。如果某项策略适合通用，就先加进 `@raypx-kit/logger`。
3. **rate-limit 和 notify 占位**：这两个是 raypx Web 手机端方案马上要用的，先建。
4. **mail 迁入**：建 `@raypx-kit/mail` 并发布；raypx 的 `@raypx/mail` 改为依赖它（raypx 侧单独提交）。
5. **security**：新建 CSP 生成、安全头和 Hono 中间件并发布；raypx 的 api 接入安全头（raypx 侧单独提交）。
6. **其余占位**：webhooks、flags、analytics、observability、ai、payments，全部保持 `private`。
7. **收尾**：docs 站点导航按“已发布”和“占位”分组；根 README 包表格加一列状态。

## 不在本方案内

- raypx 里还在变化的本地运行时代码（文件授权、任务调度、进程管理、stdio RPC、Electrobun
  宿主工具）暂不迁入，等它们稳定后另起方案。
- raypx 的本地开发工具 `apps/devtools`（服务状态、环境变量检查、邮件预览、翻译对比）在
  raypx 仓库里单独规划。

## 已选好的默认值（如需更改请在执行前说明）

| 问题           | 默认                                            |
| -------------- | ----------------------------------------------- |
| 仓库名         | `raypx/raypx-kit`（新仓库，取代 voidmix）       |
| npm 包名       | `@raypx-kit/*`                                  |
| 占位包是否发布 | 不发布（`private: true`），有真实使用方时再发布 |
| 供应商驱动     | 只在有真实需求时添加，占位阶段只有内存或空驱动  |
| AI 包          | 只定义接口，暂不依赖 Vercel AI SDK              |
