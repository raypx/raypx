# 测试用例全量检查与分层重构（2026-10-27）

> Historical validation snapshot: the Worker deployment target and its gates have been removed.
> Current deployment and verification use Node; commands below record the earlier state.

基线为 `codex/vp-task-runner` 的 `337725a`，改动保留在该分支。
先以 `--no-cache` 执行全部默认测试，1087 项通过，再进行结构调整。

## 清单与保留证明

基线有 209 个测试文件：185 个默认 Vitest 文件、12 个 PostgreSQL／Redis
文件、12 个 Playwright 文件。没有发现遗留 `.only`。

重构后有 215 个测试文件，其中 191 个属于普通 Vitest 门禁。实际执行三个
分层入口后，以「工作区 + 完整用例名称」的多重集合对账，原有 1087 项全部
保留；191 个文件没有遗漏，也没有跨分层重复选择。新增 1 个仓库清单检查和
2 个 CSP 验收隔离用例，共 1090 项。

| 工作区    |    单元 |    组件 |    集成 |     合计 |
| --------- | ------: | ------: | ------: | -------: |
| API       |     103 |       0 |      46 |      149 |
| CLI       |     123 |       0 |     161 |      284 |
| Desktop   |     101 |      90 |       5 |      196 |
| Web       |      13 |      96 |       0 |      109 |
| Account   |       6 |       0 |       0 |        6 |
| AI        |      33 |       0 |       0 |       33 |
| Analytics |       5 |       5 |       0 |       10 |
| Auth      |      13 |       0 |       0 |       13 |
| Blocks    |       0 |       7 |       0 |        7 |
| Client    |       4 |       0 |       0 |        4 |
| Contracts |      10 |       0 |       0 |       10 |
| Core      |      11 |       0 |       0 |       11 |
| Database  |       1 |       0 |       0 |        1 |
| Email     |       5 |       0 |       0 |        5 |
| i18n      |      21 |       6 |       0 |       27 |
| Jobs      |      15 |      10 |       0 |       25 |
| Logger    |      29 |       0 |       0 |       29 |
| Memory    |      11 |      26 |       0 |       37 |
| Storage   |       6 |       0 |       0 |        6 |
| Tasks     |      32 |       0 |       0 |       32 |
| Tooling   |      27 |       0 |      22 |       49 |
| UI        |       0 |      47 |       0 |       47 |
| **合计**  | **569** | **287** | **234** | **1090** |

Host 的传输行为继续由 Desktop control 和 CLI daemon 用例覆盖；移除其没有
用例的占位 `test` 命令，没有把空执行计作通过。

## 调整内容

- CLI 按 `unit/`、`integration/` 分层后再镜像能力目录。Agent 的生命周期／审批、
  输入竞态、上下文／恢复各自成套，共用每例新建的宿主夹具。真实的十秒中断和
  长时间排队边界保留在集成层。
- Desktop 的引擎子进程和跨进程实例锁归入集成层；外链校验回到独立主题文件。
- Memory 分成资料管理／版本、选择器／快照、预算三套组件用例，共享有明确
  生命周期的端口夹具，各例仍独立清理 DOM、动画设置及 mock。
- Web 的纯单元测试使用 `node` 测试环境，组件才初始化 jsdom 和 DOM setup；
  Web 与 i18n 共用项目配置构造器。测试进程仍由 Bun 运行。
- Analytics 的纯策略与 DOM／storage 场景分开，i18n 的浏览器组件归入组件目录。
- 移除 28 个空测试入口，补齐 CLI／Analytics 的有效入口。清单回归检查要求
  活跃分层有入口、空分层无占位入口，并拒绝 `.only`。新脚手架不再以
  `--passWithNoTests` 隐藏尚未编写的用例。

## 显式门禁与发现

| 门禁                                         | 本轮结果                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 默认分层用例                                 | 1090 项通过；完整 `bun run verify` 通过，含类型、lint、格式、policy、i18n、两种运行时构建和产物冒烟 |
| PostgreSQL 17.11，Node                       | 8 文件、46 项通过                                                                                   |
| Redis 8.8.0                                  | 1 文件、4 项通过                                                                                    |
| PostgreSQL，实际 workerd                     | 3 文件、6 项通过，包含直连与 Hyperdrive                                                             |
| 完整 Playwright，含真实 relay 后端           | 29 通过、1 跳过，0 重试；15.4 秒浏览器执行时间                                                      |
| 默认 Playwright 环境                         | 28 通过、2 个显式门禁跳过                                                                           |
| macOS 打包                                   | arm64 稳定 DMG 构建通过                                                                             |
| Native 冒烟                                  | 通过；打包 renderer、IPC、CLI、tray、偏好／会话隔离重启、GUI Quit 后 daemon 存活                    |
| Windows、真实 HTTPS、外部 Claude／Codex 推理 | 未验证                                                                                              |

数据库和 Redis 使用独立临时目录、随机端口及测试数据库；PostgreSQL 使用
随机密码的 SCRAM 认证。测试结束关闭实例并删除临时数据，没有使用已有服务。
Hyperdrive 首轮拒绝无密码测试 URL，修正临时环境后重新执行全部数据库门禁。

真实 relay 浏览器门禁首次暴露 Desktop 预览 CSP 阻止 HTTP 回环 API。trace
确认请求在浏览器中被 `connect-src` 拦截。仅处理 `artifacts/browser/client`
时，构建脚本为已校验的回环 API 加入精确 Origin；正式产物策略有独立回归
断言。静态服务继续原样提供编译后的 HTML／CSP，没有改写响应或关闭浏览器安全。
真实后端门禁使用模拟宿主帧，不代替打包 IPC、真实 HTTPS 或外部推理验收。

## 复现与证据

```sh
bun run test --no-cache
bun run test unit --no-cache
bun run test component --no-cache
bun run test integration --no-cache
bun run verify
```

JSON 用例清单可由各入口加上
`-- --reporter=json --outputFile=node_modules/.cache/raypx-tests/<阶段>.json`
生成，报告按工作区保存。比较名称时保留重复次数，允许文件移动。
本机原始清单、耗时、保留对账、浏览器 JSON 和 trace 存于忽略目录
`.artifacts/test-review/`；受环境约束的门禁按 [测试指南](testing.md) 显式运行。

这次检查建立了用例选择与执行的完整性，不等于代码行覆盖率达到 100%。没有
通过放宽断言、删除错误路径或共享认证上下文来压低数量，也不将不同层次的
相似断言视作重复覆盖。不以这些不同选择范围的耗时声称整套执行提速。

## 所属包与能力目录二次整理

以 `35905ef` 的 1090 项为基线，继续留在 `codex/vp-task-runner`。
这轮只调整测试、测试配置和说明，没有修改产品运行代码。

- Web 的八套共享 Tasks 组件用例移入 `packages/tasks/tests/component/`，
  按 composer、conversation、observed、workspace 分组。六套纯规则移入
  `tests/unit/`，独立入口分别选择 node 和 jsdom 测试环境，运行时仍是 Bun。
  Web 保留应用认证、路由和草稿接续。
- Desktop 的共享 `RemoteControl` 用例移入 Host 集成层，按续期、回放、快照拆分。
  每例仍新建真实回环 WebSocket 和临时目录，保留退避与十秒收尾边界。
- Pi 的 824 行单文件按生命周期、工具持久化、最终结果拆为三套；Desktop 的
  工作区按对话、历史、草稿归属拆为三套，使用应用内每例重置的夹具。
  不跨应用导入私有测试实现。renderer 夹具也显式进入 Desktop 的浏览器类型检查。
- Worker 的认证、清理和计划共用进程启动、就绪、诊断脱敏与退出清理；
  各套件仍独立准备数据库、执行断言，保留直连与 Hyperdrive 两种模式。

以「迁移后的所属包 + 完整用例名称」多重集合对账，1090 项全部保留，
没有新增或删除用例；198 个默认文件全部执行一次，没有重复选择。
另外对 63 个拆分前后的用例声明做 AST 对比，正文和断言保持一致；
Desktop 仅将夹具状态引用改为显式 `state`。
从 Desktop 单元层迁入 Host 集成层的 17 项使分层总数变为
552 单元、287 组件、251 集成。普通和显式门禁合计 222 个测试源文件。

| 变化的工作区 | 单元 | 组件 | 集成 | 合计 |
| ------------ | ---: | ---: | ---: | ---: |
| CLI          |  123 |    0 |  161 |  284 |
| Desktop      |   84 |   90 |    5 |  179 |
| Web          |   13 |   50 |    0 |   63 |
| Host         |    0 |    0 |   17 |   17 |
| Tasks        |   32 |   46 |    0 |   78 |

本轮无缓存全仓测试 1090 项通过；临时 PostgreSQL 17.11 上的真实 workerd
三文件六项通过，覆盖直连和 Hyperdrive。临时实例已关闭，数据已清理。
完整 `bun run verify` 通过；Tasks 的单元／组件入口分别实跑 32／46 项，
Host 的集成入口实跑 17 项，选择范围和预期一致。Web／Desktop Playwright
28 项通过、2 个外部门禁跳过、0 重试，浏览器执行 14.8 秒。
原始报告、迁移映射、用例对账与独立数据库日志在忽略目录
`.artifacts/test-ownership/`。前一轮的 Windows、真实 HTTPS 和外部推理限制仍然有效。
目录调整改善所属包的定向反馈，不以此声称整套执行时间缩短。

## 验证工具正规化与产物清理

可复用的用例清单、用例保留对账、分层执行及隔离数据库／浏览器验收
迁入 `packages/tooling/src/validation/`。正式入口和参数见
[验证脚本与产物清理](validation-artifacts.md)。旧 VP 快照实验、AST 重写、
临时种子和提交文案已从 `.artifacts/` 清除，历史生成报告仍保留。
`clean:artifacts` 只删除证据、覆盖率和测试报告缓存，保留构建、SDK 和用户数据；
`clean` 复用这些规则后再执行原有完整清理。

新增 8 项回归覆盖清理边界、用例多重集合、报告完整性、进程失败回收、
日志截断及验收环境隔离。正式清单入口实跑 1098 项通过、202 个默认文件
各选中一次，与上一轮相比缺失 0 项、增加 8 项。当前分层为
556 单元、287 组件、255 集成；连同显式门禁共 226 个测试源文件。
本轮临时 PostgreSQL 46 项、Redis 4 项、真实 workerd／Hyperdrive 6 项通过；
真实 relay 后端的完整浏览器验收 29 项通过、1 项外部推理跳过、0 重试。

实跑修正了验收脚本把 `NODE_ENV=test` 传给构建而影响 JSX 产物的问题。
测试 API 改用 `RAYPX_VALIDATION=1`，构建保留工具链默认模式。
本机高负载时也出现过既有集成／relay 超时；daemon 测试改为按既有十秒
启动预算等待就绪和实际日志，移除固定睡眠，保留存活、退出码和脱敏断言。
最终全仓对账及完整 `bun run verify` 均通过，包含格式、lint、policy、类型、
默认测试、两类运行时构建及产物冒烟；不以不同环境下的耗时声称性能改善。

原始记录保留在 `.artifacts/organization/` 及新的 `.artifacts/tests/`、
`.artifacts/backends/`。隔离后端启动入口目前要求 POSIX；Windows、真实 HTTPS
和外部 Agent 推理未在本轮验证，不计作通过。
