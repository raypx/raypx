# Tooling 收敛与 devkit 迁入执行方案

本文是交给执行者（Codex）的完整任务说明。目标有三个：

1. 把外部依赖 `@raypx-kit/devkit` 的源码迁入本仓库，取消"发版 → 改 catalog"的循环。
2. 把 `packages/tooling` 拆开，让修改校验/验证代码不再使所有 workspace 的 `check` 缓存失效。
3. 在前两步的基础上删除因此变得多余的代码。

不改变任何对外行为：`raypx-dev` 的命令、参数、输出、CI 计划格式和缓存语义都保持不变。

## 1. 现状（已核对的事实）

| 项                                   | 数值                                                            |
| ------------------------------------ | --------------------------------------------------------------- |
| `packages/tooling` 源码              | 57 个文件，约 5640 行                                           |
| `packages/tooling` 测试              | 约 3415 行                                                      |
| 其中 `validation/` + `verification/` | 2155 + 1106 行                                                  |
| tooling 公共入口的导入闭包           | 17 个文件，约 1210 行                                           |
| 依赖 `@raypx/tooling` 的 workspace   | 34 个（全部通过 `vite.config.ts` 导入 `./tasks`）               |
| devkit 源码 / 测试                   | 约 1900 / 1690 行，当前版本 `0.0.0-alpha.6`                     |
| devkit 入口                          | 12 个，本仓库用到 9 个                                          |
| devkit 外部依赖                      | `@dotenvx/dotenvx`、`confbox`、`oxc-parser`，开发期 `vite-plus` |

devkit 未被本仓库导入的入口：`toolchain`（344 行）、`lint`（61 行）、`testing`（11 行）。

本仓库导入 devkit 的位置：

- `packages/tooling`：30 个文件，入口为 `workspaces`、`tasks`、`architecture`、`process`、
  `catalogs`、`vite`、`verification`、`docs`、`artifact`。
- `packages/runtime-node/scripts/task.ts` 和 `packages/tsconfig/scripts/task.ts`：
  只用 `tasks` 的 `runTaskLeaf`。

缓存失效范围的根因在 `packages/tooling/src/tasks/check-inputs.ts`：消费者的 `check`
任务把整个 tooling workspace 列为输入，只排除 `src/verification/`。因此修改
`src/validation/`、`src/smoke/`、`src/cli.ts`、`src/policy.ts` 等私有代码，
会让 34 个 workspace 的类型检查缓存全部失效。

未核对的事项：没有实测 `bun run verify`、tooling 测试和 CLI 启动的耗时。阶段 0 负责补上。

## 2. 目标结构

依赖方向自下而上，必须保持无环（包括 devDependencies）：

```text
@raypx/devkit        packages/devkit     通用仓库机制，无内部依赖
   ↑
@raypx/tsconfig, @raypx/runtime-node    只在 scripts/task.ts 使用 devkit
   ↑
@raypx/tooling       packages/tooling    被全仓消费的配置面：tasks、build、
   ↑                                     browser-server、performance
@raypx/dev-cli       packages/dev-cli    raypx-dev：policy、validation、
                                         verification、smoke、scaffold、clean
```

devkit 不能并入 tooling：tooling 依赖 `@raypx/runtime-node` 和 `@raypx/tsconfig`，
而这两个包又导入 devkit，合并会成环。

`@raypx/tooling` 保留现名和现有 8 个入口，这样 34 个消费者的 `vite.config.ts` 和
`package.json` 不需要改动。移走的是私有 CLI 部分。

## 3. 全程约束

- 遵守根 `AGENTS.md` 和各 workspace 的 `AGENTS.md`。
- 不加兼容别名：不保留 `@raypx-kit/devkit` 的转发包或旧路径的重导出。
- 不修改 `raypx/raypx-kit` 仓库，也不发布任何包。
- 每个阶段一个提交，提交信息遵循 `CONTRIBUTING.md`。在新分支
  `refactor/tooling-consolidation` 上工作，不推送、不合并。
- 每个阶段结束都要通过该阶段的验证清单才能进入下一阶段。任何一步失败且无法在
  本阶段范围内修复时，停止并报告，不要用放宽策略或跳过测试的方式绕过。
- 移动文件用 `git mv`，保留历史。测试跟随被测源码移动。
- 不手改生成文件、lockfile 之外的锁定产物和 vendored skills。

## 4. 阶段 0：基线

不改代码，只记录数据，写进最终报告：

- `bun run verify` 通过，并记录墙钟时间。
- `bun run --cwd packages/tooling test` 的墙钟时间，以及其中 `tests/integration` 的占比。
- `bun packages/tooling/src/cli.ts doctor` 的启动时间。
- 改动 `packages/tooling/src/validation/knip.ts` 一行注释后，`bun run verify --dry-run`
  选中的任务数量。这是阶段 2 的对照指标，记录后还原改动。

## 5. 阶段 1：迁入 devkit

提交：`refactor(devkit)!: vendor devkit as a local workspace`

### 5.1 取源码

来源是 `raypx/raypx-kit` 仓库的 `packages/devkit`，本机路径
`/Users/heixing/Git/raypx/raypx-kit/packages/devkit`。必须取与已发布的
`0.0.0-alpha.6` 一致的版本，对应提交 `fecd558`（`chore: release devkit 0.0.0-alpha.6`）。
该仓库在此之后还有改动 devkit 目录的提交，不要直接复制工作区文件，使用
`git -C <raypx-kit> archive fecd558 packages/devkit` 之类的方式导出。

只迁入用到的 9 个入口及其依赖的内部文件：

- `src/workspaces.ts`、`architecture.ts`、`process.ts`、`artifact.ts`、`catalogs.ts`、
  `docs.ts`、`verification.ts`、`vite.ts`、`tasks.ts` 和 `src/tasks/*`。
- 对应测试：`architecture`、`artifact`、`catalogs`、`docs`、`process`、`tasks`、
  `verification`、`vite`，以及它们用到的 `tests/fixtures`。
- 不迁入：`toolchain.ts`、`lint.ts`、`testing.ts`、`toolchain.test.ts`、`presets.test.ts`、
  `dist/`、`coverage/`、`CHANGELOG.md`、打包配置（`tsconfig.build.json`、`vite.config.ts`
  里的 `pack` 段）。

### 5.2 建立 workspace

`packages/devkit/package.json`：

- `name: "@raypx/devkit"`，`private: true`，`type: "module"`，`version: "0.0.0"`。
- `exports` 直接指向 `./src/*.ts` 源码，入口名与原包相同（去掉未迁入的 3 个）。
- `raypx.kind: "tooling"`，`raypx.target: "node"`。如果 `policy` 对 runtime-node 或
  tsconfig 的脚本导入 tooling 类 workspace 报错，按现有 `sourceTargets` 机制声明
  `scripts/**`，不要改 policy 规则。
- 三个外部依赖加入根 `package.json` 的 `catalog:dev`，版本取当前 `bun.lock` 里已解析的
  版本，workspace 内用 `catalog:dev` 引用。
- 测试按仓库约定：单元测试与源码同目录，命名和 include 规则参照
  `packages/runtime-node`。

devkit 是依赖图的最底层，有两点必须注意：

- 不能依赖 `@raypx/tsconfig`（tsconfig 依赖 devkit）。`tsconfig.json` 内联严格的
  `compilerOptions`，与 `@raypx/tsconfig/node.json` 的严格程度保持一致。
- 不能用 `@raypx/tooling/tasks` 注册任务。参照 `packages/tsconfig/vite.config.ts`
  现有的自举方式注册 `task:*`，改为相对导入自身的 `src/tasks`。

### 5.3 切换导入

- 全仓把 `@raypx-kit/devkit/` 替换为 `@raypx/devkit/`（约 33 个文件）。
- `packages/tooling`、`packages/runtime-node`、`packages/tsconfig` 的 `package.json`
  改为依赖 `"@raypx/devkit": "workspace:*"`，保持原来的 dependencies/devDependencies 位置。
- 从根 `catalog:dev` 删除 `@raypx-kit/devkit`，运行 `bun install` 更新 `bun.lock`。
- `knip.json` 为 `packages/devkit` 增加必要的 entry。

### 5.4 本阶段只做的清理

- 删除 `process.ts` 里的 Turbo 运行辅助函数（本仓库用 VP，没有调用方）。先 grep 确认。
- 为通过本仓库更严格的 TypeScript 设置（`exactOptionalPropertyTypes` 等）所需的最小改动。
- 其他行为一律不动，留给阶段 3。

### 5.5 文档

- 新增 ADR（下一个编号，当前最大为 0054）：devkit 作为本地私有源码 workspace。
  grep 找到规定 devkit 为外部依赖的既有 ADR，按仓库惯例加一条 supersession 链接，
  不改写旧 ADR 正文。
- 根 `AGENTS.md` 中"Other @raypx-kit packages remain independently released external
  dependencies"一句：把 devkit 移出该描述，说明它是本地 workspace。
- 新建简短的 `packages/devkit/AGENTS.md`；更新 `packages/tooling/AGENTS.md`、
  `docs/architecture/README.md`、`docs/development/workspaces.md` 中对 devkit 的描述。

### 5.6 验证

- `bun install` 无 lockfile 之外的意外变更。
- `bun run policy`、`bun run knip`。
- `bun run --cwd packages/devkit check` 和 `test`。
- `bun run --cwd packages/tooling check` 和 `test`。
- `bun run verify`。
- `grep -r "@raypx-kit/devkit"`（排除 `node_modules`、`.git`）只在 ADR 历史正文中出现。

## 6. 阶段 2：拆分 tooling

提交：`refactor(tooling)!: split the raypx-dev CLI into its own workspace`

### 6.1 归属划分

留在 `packages/tooling`（公共入口闭包及任务机制）：

- `src/tasks/*`（含 `leaf.ts`）、`src/build/*`、`src/browser-server.ts`、
  `src/browser-tests.ts`、`src/performance/*`、`tests/setup/dom.ts`。

移到 `packages/dev-cli`：

- `src/cli.ts`、`bin/raypx-dev.mjs`、`policy.ts`、`repository.ts`、`scaffold.ts`、
  `clean.ts`、`test-command.ts`、`analytics.ts`、`templates/`、`validation/`、
  `verification/`、`smoke/`，以及它们的测试、`tests/integration/` 和相关 `tests/helpers/`。

`tooling-entries.ts` 和 `tasks/check-inputs.ts` 在本阶段先留在 tooling，阶段 3 删除。

### 6.2 跨包导入

仓库规则禁止导入其他 workspace 的私有源码路径。移动前先列出 `dev-cli` 一侧对
tooling 一侧的全部相对导入（至少包括 `tasks/model` 的 `taskModel`/`taskPlan`/`taskRef`、
`browser-tests`、`build/release`）。处理原则：

- 能随调用方一起移到 `dev-cli` 的，移过去。
- 必须共用的，在 `@raypx/tooling` 增加明确的入口。新增入口数量控制在 3 个以内；
  超过时停止并报告，说明哪些符号造成了耦合。
- tooling 一侧不得反向导入 `dev-cli`。任务模型里对 CLI 的引用只能是命令字符串。

### 6.3 路径引用更新

以下位置硬编码了 `packages/tooling` 路径或 `@raypx/tooling` 名称，逐一按新归属更新：

- 根 `package.json`：`raypx-dev` 脚本、`@raypx/tooling` devDependency（改为或增加
  `@raypx/dev-cli`）。
- `packages/tooling/src/tasks/model.ts`：`verify:check policy|locales` 的命令路径
  （`leaf.ts` 路径不变）。
- `verification/plan.ts`：部署相关输入路径列表和对 `@raypx/tooling` 的特判。
- `repository.ts`：`browser:run` 的 CLI 路径。
- `.vite-hooks/commit-msg`、`.github/workflows/ci.yml`、`.github/workflows/performance.yml`、
  `.github/actions/native-checks/action.yml`、`.github/actions/vp-restore`、`vp-save`。
- `knip.json`、`.gitignore` 注释、`test.config.ts`（`dom.ts` 路径应保持不变，确认即可）。
- `docs/development/testing.md`、`validation-artifacts.md`、`mygo-bun-migration-plan.md`、
  `infra/AGENTS.md`、`infra/README.md`、`deploy/AGENTS.md`。

### 6.4 manifest

- `packages/dev-cli/package.json`：`name: "@raypx/dev-cli"`，`bin.raypx-dev`，无 `exports`，
  `raypx.kind: "tooling"`，`raypx.target: "bun"`，保留 `uncachedTasks: ["test"]`，
  带走 `test:inventory`、`test:backends`、`test:integration` 脚本和 `@posthog/cli`、
  `@raypx-kit/intl` 等只被私有代码使用的依赖。
- `packages/tooling/package.json`：删除 `bin`、移走的脚本和不再需要的依赖，
  清理 `sourceTargets` 中已不存在的路径。
- AGENTS.md 中"tooling 完整测试会启动独立的缓存 VP runner，必须不在文件系统
  tracer 内运行"这一约束跟随集成测试转移到 `dev-cli`。确认 tooling 剩余测试
  是否仍需要 `uncachedTasks`，不需要就去掉。

### 6.5 验证

- 阶段 1 的全部验证项，加上 `packages/dev-cli` 的 `check` 和 `test`。
- `bun run test:inventory` 通过（它校验每个测试层都有对应命令）。
- `bun run verify --dry-run` 的输出在无改动时与阶段 0 一致（workspace 名称变化除外）。
- `raypx-dev ci:plan` 的输出字段不变。
- 重做阶段 0 的对照实验：改 `validation/knip.ts` 一行注释，被选中的 `check` 任务应只剩
  `dev-cli` 自身。把前后任务数量写进报告。
- GitHub workflow 无法在本地运行：报告中明确标为"未验证"，并列出改过的 workflow 行。

## 7. 阶段 3：删除多余代码

提交：`refactor(tooling): drop consumer input narrowing and devkit indirection`

拆分之后，下列代码的存在理由消失，逐项删除并删掉对应测试：

- `tasks/check-inputs.ts` 中的 `toolingConsumerCheckInputs` 及 `tasks/model.ts` 里
  `usesVerification`、`consumerInputs` 相关分支。消费者直接以整个 tooling workspace
  为输入。
- `tooling-entries.ts` 的 `toolingSourceClosure`，以及 `verification/tooling.ts` 里
  为区分"私有 gate / 公共 helper"而做的入口闭包分析。先确认每个符号没有其他调用方；
  仍被使用的保留，并在报告里说明。
- `verification/plan.ts` 中因此不再需要的 `@raypx/tooling` 特判。

devkit 的通用性收敛（只做下面列出的，不做其他重构）：

- `discover` 的 `metadataKey` 选项固定为 `"raypx"`，删除 `repository.ts` 里的包装函数
  和各处重复传参。
- `tooling/src/tasks/model.ts`（约 380 行）与 `devkit/src/tasks/model.ts`（约 110 行）
  之间只为"通用 + 约定"分层而存在的类型参数和回调，能内联的内联。不合并文件，
  不改变任务图的输出。
- 删除迁入后没有任何导入方的 devkit 导出符号。以 `bun run knip` 的结果为准。

以下两项需要仓库所有者确认后才执行，默认不做，只在报告里给出影响：

- 删除 `validation/cli-size.ts`、`cli:experiment` 命令和 `.github/workflows/cli-size.yml`。
- 把 `validation/deployment-smoke.ts` 迁到 `infra/*`。

验证：同阶段 2。另外用任务图快照对比确认阶段 3 前后 `raypx-dev tasks check --dry-run`
（或等价的计划输出）除缓存输入列表外无差异。

## 8. 阶段 4：CLI 懒加载

提交：`refactor(dev-cli): dispatch commands through a lazy table`

- 把 `cli.ts` 的 `switch` 改成"命令名 → 处理函数"的查找表，每个处理函数内部
  `await import` 自己的模块。`env`、`doctor`、`clean` 这类命令不再加载
  policy/verification/validation。
- 命令名、参数解析、用法文案、错误信息和退出码保持逐字不变。
- 帮助文案里列出的命令从查找表生成，避免两处维护。
- 验证：`dev-cli` 测试、`bun run verify`，并重测 `doctor` 启动时间与阶段 0 对比。

## 9. 阶段 5：文档收尾

提交：`docs(tooling): align workspace guides with the split`

- `packages/tooling/AGENTS.md` 目前约 170 行且混合了三个包的内容。按新归属拆到
  `packages/devkit`、`packages/tooling`、`packages/dev-cli` 三份，各自保持简短，
  删除已不成立的描述（例如 consumer 排除 `src/verification/` 的说明）。
- 更新 `docs/architecture/README.md`、`docs/development/workspaces.md`、`testing.md`、
  `caching.md` 中涉及的内容。
- 所有 Markdown 文件不超过 500 行（`policy` 会检查）。
- 完成后删除本文件，或把它改写为交付记录，并同步 `docs/README.md` 的索引。

## 10. 完成标准

- 五个阶段各一个提交，全部在 `refactor/tooling-consolidation` 分支上。
- `bun run verify --full` 在当前平台通过。
- 仓库中不再有对 `@raypx-kit/devkit` 的依赖。
- 修改 `dev-cli` 私有代码不再使其他 workspace 的 `check` 缓存失效，有阶段 0 与
  阶段 2 的对照数据。
- `raypx-dev` 的命令行为和 CI 计划输出不变。

最终报告需要包含：

- 各阶段前后的源码/测试行数（按 workspace）。
- 阶段 0 的三个耗时与完成后的对应数值。
- 未执行或无法验证的检查，逐条列出。至少包括 GitHub workflow、Windows/Linux
  平台、PostgreSQL/浏览器/打包原生验收。不得把未运行的平台描述为通过。
- 新增的 `@raypx/tooling` 入口及其理由。
- 阶段 3 中等待所有者确认的两项的影响评估。

## 11. 范围之外

- `raypx/raypx-kit` 仓库里 devkit 包的去留（冻结、弃用或继续维护）由所有者另行决定。
- `@raypx-kit/intl`、`@raypx-kit/analytics`、`@raypx-kit/email-preview` 和
  `drizzle-kit` 分支包保持外部依赖。
- 集成测试（`cache-*.test.ts`）的合并提速，等本方案完成、有耗时数据后单独评估。
