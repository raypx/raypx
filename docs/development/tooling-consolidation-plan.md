# Tooling 收敛与 devkit 迁入执行方案

本文是交给执行者（Codex）的完整任务说明。目标有三个：

1. 把外部依赖 `@raypx-kit/devkit` 的源码迁入本仓库，取消"发版 → 改 catalog"的循环。
2. 把 `raypx-dev` 的命令实现从 `packages/tooling` 移到已有的 `packages/scripts`，
   让修改校验/验证代码不再使所有 workspace 的 `check` 缓存失效。
3. 在前两步的基础上删除因此变得多余的代码。

不改变任何对外行为：`raypx-dev` 的命令、参数、输出、CI 计划格式和缓存语义都保持不变。

## 1. 现状（2026-11-12 在 `canary` 的 `257dbc22` 上核对）

| 项                                   | 数值                                                            |
| ------------------------------------ | --------------------------------------------------------------- |
| `packages/tooling` 源码（不含测试）  | 6006 行                                                         |
| `packages/tooling` 测试              | 4589 行                                                         |
| 其中 `validation/` + `verification/` | 2502 + 1185 行（含同目录测试）                                  |
| `packages/tooling/AGENTS.md`         | 245 行，混合了命令、任务和构建三类内容                          |
| 依赖 `@raypx/tooling` 的 workspace   | 34 个（全部通过 `vite.config.ts` 导入 `./tasks`）               |
| devkit 源码 / 测试                   | 约 1900 / 1690 行，当前版本 `0.0.0-alpha.6`                     |
| devkit 入口                          | 12 个，本仓库用到 9 个                                          |
| devkit 外部依赖                      | `@dotenvx/dotenvx`、`confbox`、`oxc-parser`，开发期 `vite-plus` |
| 导入 devkit 的文件                   | 34 个                                                           |

devkit 未被本仓库导入的入口：`toolchain`（344 行）、`lint`（61 行）、`testing`（11 行）。

本仓库导入 devkit 的位置：

- `packages/tooling`：入口为 `workspaces`、`tasks`、`architecture`、`process`、
  `catalogs`、`vite`、`verification`、`docs`、`artifact`。
- `packages/runtime-node/scripts/task.ts` 和 `packages/tsconfig/scripts/task.ts`：
  只用 `tasks` 的 `runTaskLeaf`。

`packages/scripts`（`@raypx/scripts`）已经存在：

- 只含 `bin/raypx-dev.mjs`（3 行，调用 `@raypx/tooling/cli` 的 `runCli`）。
- 无 `exports`，被根 `package.json`、`apps/web`、`apps/desktop`、`e2e` 声明为依赖。
- CI 的计划任务用 `bun install --production --filter '@raypx/scripts'` 做最小安装
  （`.github/workflows/ci.yml`）。
- 它的 `AGENTS.md` 目前规定"命令实现留在 Tooling，本包只做参数转发"。本方案会改写这条。

缓存失效范围的根因：

- `packages/tooling/src/tasks/model.ts` 的 `checkInputs` 把每个 workspace 的完整依赖闭包
  列为 `check` 任务的输入。
- 对 `@raypx/tooling` 有一个特判：通过 `tasks/check-inputs.ts` 的
  `toolingConsumerCheckInputs` 只排除 `src/verification/`。
- 因此修改 `src/validation/`、`src/smoke/`、`src/cli.ts`、`src/policy.ts` 等私有代码，
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
@raypx/scripts       packages/scripts    raypx-dev 的全部实现：cli、policy、
                                         validation、verification、smoke、
                                         scaffold、clean、test-command
```

两个决定及其理由：

- devkit 不能并入 tooling：tooling 依赖 `@raypx/runtime-node` 和 `@raypx/tsconfig`，
  而这两个包又导入 devkit，合并会成环。
- 不新建 `dev-cli` workspace：`@raypx/scripts` 已经拥有 `raypx-dev` 可执行文件和 CI 的
  最小安装入口，命令实现放进去之后 `@raypx/tooling/cli` 这个入口可以删除，
  包的数量不增加。

`@raypx/tooling` 保留现名和除 `./cli` 之外的现有入口，34 个消费者的
`vite.config.ts` 和 `package.json` 不需要改动。

## 3. 全程约束

- 遵守根 `AGENTS.md` 和各 workspace 的 `AGENTS.md`。本方案明确授权改写
  `packages/scripts/AGENTS.md` 中"命令实现留在 Tooling"的约束，其他约束不得放宽。
- 不加兼容别名：不保留 `@raypx-kit/devkit` 的转发包、旧路径的重导出或
  `@raypx/tooling/cli` 入口。
- 不修改 `raypx/raypx-kit` 仓库，也不发布任何包。
- 每个阶段一个提交，提交信息遵循 `CONTRIBUTING.md`，不加任何 `Co-Authored-By`
  或 AI 署名行。在新分支 `refactor/tooling-consolidation` 上工作，不推送、不合并。
- 每个阶段结束都要通过该阶段的验证清单才能进入下一阶段。任何一步失败且无法在
  本阶段范围内修复时，停止并报告，不要用放宽策略或跳过测试的方式绕过。
- 移动文件用 `git mv`，保留历史。测试跟随被测源码移动。
- 不手改生成文件、lockfile 之外的锁定产物和 vendored skills。

## 4. 阶段 0：基线

不改代码，只记录数据，写进最终报告：

- `bun run verify` 通过，并记录墙钟时间。
- `bun run --cwd packages/tooling test` 的墙钟时间，以及其中 `tests/integration` 的占比。
- `bun packages/scripts/bin/raypx-dev.mjs doctor` 的启动时间，取 5 次中位数。
- 改动 `packages/tooling/src/validation/knip.ts` 一行注释后，`bun run verify --dry-run`
  选中的任务数量。这是阶段 2 的对照指标，记录后还原改动。

## 5. 阶段 1：迁入 devkit

提交：`refactor(devkit)!: vendor devkit as a local workspace`

### 5.1 取源码

来源是 `raypx/raypx-kit` 仓库的 `packages/devkit`，本机路径
`/Users/heixing/Git/raypx/raypx-kit/packages/devkit`。必须取与已发布的
`0.0.0-alpha.6` 一致的版本，对应提交 `fecd558`（`chore: release devkit 0.0.0-alpha.6`），
也可以用标签 `@raypx-kit/devkit@0.0.0-alpha.6` 核对。该仓库在此之后还有改动 devkit
目录的提交，不要直接复制工作区文件，使用
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

- 全仓把 `@raypx-kit/devkit/` 替换为 `@raypx/devkit/`（34 个文件）。
- `packages/tooling`、`packages/runtime-node`、`packages/tsconfig` 的 `package.json`
  改为依赖 `"@raypx/devkit": "workspace:*"`，保持原来的 dependencies/devDependencies 位置。
- 从根 `catalog:dev` 删除 `@raypx-kit/devkit`，运行 `bun install` 更新 `bun.lock`。
- `knip.json` 为 `packages/devkit` 增加必要的 entry。

### 5.4 本阶段只做的清理

- 删除 `process.ts` 里的 Turbo 运行辅助函数（本仓库用 VP，没有调用方）。先 grep 确认。
- 为通过本仓库更严格的 TypeScript 设置（`exactOptionalPropertyTypes` 等）所需的最小改动。
- 其他行为一律不动，留给阶段 3。

### 5.5 文档

- 新增 ADR `docs/architecture/0056-in-repo-devkit.md`（当前最大编号为 0055）：
  devkit 作为本地私有源码 workspace。写法参照 `0055-in-repo-intl-runtime.md`。
  当前没有 ADR 正文规定 devkit 为外部依赖，执行时再 grep 确认一次；如有，
  按仓库惯例加 supersession 链接，不改写旧 ADR 正文。
- 根 `AGENTS.md` 中"Other @raypx-kit packages remain independently released external
  dependencies"一句：把 devkit 移出该描述，说明它是本地 workspace。
- 新建简短的 `packages/devkit/AGENTS.md`；更新 `packages/tooling/AGENTS.md`、
  `docs/architecture/README.md`、`docs/development/workspaces.md`、
  `docs/development/kit-library-release.md` 中对 devkit 的描述。

### 5.6 验证

- `bun install` 无 lockfile 之外的意外变更。
- `bun run policy`、`bun run knip`。
- `bun run --cwd packages/devkit check` 和 `test`。
- `bun run --cwd packages/tooling check` 和 `test`。
- `bun run verify`。
- `grep -r "@raypx-kit/devkit"`（排除 `node_modules`、`.git`）只在 ADR 历史正文中出现。

## 6. 阶段 2：命令实现移入 scripts

提交：`refactor(scripts)!: move the raypx-dev implementation out of tooling`

### 6.1 归属划分

留在 `packages/tooling`（公共入口闭包及任务机制）：

- `src/tasks/*`（含 `leaf.ts`）、`src/build/*`、`src/browser-server.ts`、
  `src/browser-tests.ts`、`src/performance/*`、`tests/setup/dom.ts`。

移到 `packages/scripts/src/`（保持原有相对目录结构）：

- `cli.ts`、`policy.ts`、`repository.ts`、`scaffold.ts`、`clean.ts`、`test-command.ts`、
  `analytics.ts`、`templates/`、`validation/`、`verification/`、`smoke/`，
  以及它们的同目录测试、`locales.test.ts`、`markdown-length.test.ts`。
- `tests/integration/` 中测 CLI 侧的用例和 `tests/helpers/`。逐个判断归属：
  `browser-server.test.ts`、`browser-graph.test.ts`、`task-leaf.test.ts` 测的是留在
  tooling 的代码，留下；其余移走。两边都要用的 helper 复制会造成重复，
  这种情况停止并报告。

`bin/raypx-dev.mjs` 改为相对导入 `../src/cli.js` 的 `runCli`。

`tooling-entries.ts` 和 `tasks/check-inputs.ts` 在本阶段先留在 tooling，阶段 3 删除。

### 6.2 跨包导入

仓库规则禁止导入其他 workspace 的私有源码路径。移动前先列出 scripts 一侧对
tooling 一侧的全部相对导入（至少包括 `tasks/model` 的 `taskModel`/`taskPlan`/`taskRef`、
`browser-tests`、`build/release`）。处理原则：

- 能随调用方一起移到 scripts 的，移过去。
- 必须共用的，在 `@raypx/tooling` 增加明确的入口。新增入口数量控制在 3 个以内；
  超过时停止并报告，说明哪些符号造成了耦合。
- tooling 一侧不得反向导入 scripts。任务模型里对 CLI 的引用只能是命令字符串。
- 删除 `@raypx/tooling` 的 `./cli` 入口（唯一消费者就是 scripts 的 bin）。

### 6.3 路径引用更新

以下位置硬编码了 `packages/tooling/src/cli.ts` 路径，改为 `packages/scripts/src/cli.ts`：

- `packages/tooling/src/tasks/model.ts`：`verify:check policy|locales` 的命令。
- `repository.ts`：`browser:run`。
- `validation/tests.ts`、`validation/backends.ts`。
- `verification/plan.test.ts` 的期望路径。

以下位置引用了 `packages/tooling` 或 `@raypx/tooling`，逐一按新归属确认：

- `verification/plan.ts`：部署相关输入路径列表和对 `@raypx/tooling` 的特判。
- `packages/tooling/src/tasks/model.ts` 的 `usesVerification` 正则
  （匹配 `tooling/src/verification|cli.`），改为匹配新路径。
- `.vite-hooks/commit-msg`、`.github/workflows/ci.yml`、`.github/workflows/performance.yml`、
  `.github/actions/native-checks/action.yml`、`.github/actions/vp-restore`、`vp-save`。
- `knip.json`、`.gitignore` 注释、`test.config.ts`（`dom.ts` 路径应保持不变，确认即可）。
- `docs/development/testing.md`、`validation-artifacts.md`、`getting-started.md`、
  `workspaces.md`、`mygo-bun-migration-plan.md`、`infra/AGENTS.md`、`infra/README.md`、
  `deploy/AGENTS.md`。

根 `package.json` 的 `raypx-dev` 脚本已经指向 `packages/scripts/bin/raypx-dev.mjs`，
不用改。

### 6.4 manifest

`packages/scripts/package.json`：

- 保持 `name`、`bin`、无 `exports`、`raypx.kind: "tooling"`、`raypx.target: "bun"`。
- 带走 `test`、`test:unit`、`test:integration`、`test:inventory`、`test:backends`
  脚本，命令路径改为 `src/cli.ts`。
- 只被私有代码使用的依赖（`@posthog/cli`、`@formatjs/icu-messageformat-parser`、
  `oxc-parser`、`@raypx/devkit` 等，以实际导入为准）移入 `dependencies`，
  不放 devDependencies：CI 的 `--production --filter '@raypx/scripts'` 最小安装
  必须能跑 `ci:plan`。
- 增加 `@vitest/coverage-v8` 等测试依赖到 devDependencies，`vite.config.ts` 继续用
  `@raypx/tooling/tasks` 注册任务。
- `tsconfig.json` 的 `include` 增加 `src/**` 和 `tests/**`。

`packages/tooling/package.json`：删除 `./cli` 入口、移走的脚本和不再需要的依赖，
清理 `sourceTargets` 中已不存在的路径。

### 6.5 AGENTS.md

- 改写 `packages/scripts/AGENTS.md`：本包拥有 `raypx-dev` 的全部命令实现、
  repository validation 和 verification；依赖方向仍是 Scripts → Tooling；
  除可执行文件外不提供入口。
- 根 `AGENTS.md` 中"Reusable repository validation belongs in Tooling's `src/validation/`"
  改为 Scripts。

### 6.6 验证

- 阶段 1 的全部验证项，加上 `packages/scripts` 的 `check` 和 `test`。
- `bun run test:inventory` 通过（它校验每个测试层都有对应命令）。
- 在干净目录里模拟 CI 最小安装：
  `bun install --frozen-lockfile --production --filter '@raypx/scripts' --ignore-scripts`
  后运行 `raypx-dev ci:plan` 成功。
- `bun run verify --dry-run` 的输出在无改动时与阶段 0 一致（路径变化除外）。
- `raypx-dev ci:plan` 的输出字段不变。
- 重做阶段 0 的对照实验：改 `packages/scripts/src/validation/knip.ts` 一行注释，
  记录被选中的 `check` 任务。预期只剩 scripts 自身以及声明了 `@raypx/scripts` 的
  `web`、`desktop`、`e2e`（阶段 3 处理后三者）。把前后任务数量写进报告。
- GitHub workflow 无法在本地运行：报告中明确标为"未验证"，并列出改过的 workflow 行。

## 7. 阶段 3：删除多余代码

提交：`refactor(tooling): drop consumer input narrowing and devkit indirection`

### 7.1 check 输入规则

拆分之后，tooling 剩下的代码全部属于公共入口闭包，按整个 workspace 指纹即可。
同时把"依赖闭包"的规则改为只计入可被导入的依赖：

- `checkInputs` 只把有 `exports` 的依赖 workspace 计入输入。没有 `exports` 的依赖
  （例如只提供 `bin` 的 `@raypx/scripts`）不可能影响类型检查结果。
  这样 `web`、`desktop`、`e2e` 的 `check` 也不再随 scripts 失效。
- 先确认 `exports` 为空的 workspace 名单，写进报告。如果其中有被 TypeScript
  以其他方式读取的（例如 `tsconfig` 的 `extends` 指向它），保留它并说明。

随后删除：

- `tasks/check-inputs.ts` 整个文件，及 `tasks/model.ts` 里 `usesVerification`、
  `consumerInputs`、`toolingInputs` 相关分支和参数。
- `tooling-entries.ts` 的 `toolingSourceClosure`，以及 `verification/tooling.ts` 里
  为区分"私有 gate / 公共 helper"而做的入口闭包分析。先确认每个符号没有其他调用方；
  仍被使用的保留，并在报告里说明。
- `verification/plan.ts` 中因此不再需要的 `@raypx/tooling` 特判。

### 7.2 devkit 收敛

只做下面列出的，不做其他重构：

- `discover` 的 `metadataKey` 选项固定为 `"raypx"`，删除 `repository.ts` 里的包装函数
  和各处重复传参。
- `tooling/src/tasks/model.ts`（约 400 行）与 `devkit/src/tasks/model.ts`（约 110 行）
  之间只为"通用 + 约定"分层而存在的类型参数和回调，能内联的内联。不合并文件，
  不改变任务图的输出。
- 删除迁入后没有任何导入方的 devkit 导出符号。以 `bun run knip` 的结果为准。

### 7.3 需要所有者确认的两项

默认不做，只在报告里给出影响（删除的行数、受影响的命令和 workflow、替代方案）：

- 删除 `validation/cli-size.ts`（199 行）、`cli:experiment` 命令和
  `.github/workflows/cli-size.yml`。
- 把 `validation/deployment-smoke.ts`（433 行，validation 中最大的文件）及其集成测试
  迁到 `infra/*`。

### 7.4 验证

同阶段 2。另外：

- 用任务图快照对比确认阶段 3 前后 `raypx-dev tasks check --dry-run`
  （或等价的计划输出）除缓存输入列表外无差异。
- 重做对照实验，被选中的 `check` 任务应只剩 scripts 自身。

## 8. 阶段 4：CLI 懒加载（按数据决定是否执行）

`cli.ts` 目前 209 行、18 个静态导入、26 个命令分支。懒加载的收益没有实测过，
先测量再决定：

- 阶段 3 之后，用 `bun --cpu-prof` 或对比 `doctor` 与空脚本的启动时间，
  估算静态导入的开销。
- 如果懒加载预计让 `doctor` 启动时间减少不足 50ms，跳过本阶段，在报告里给出数据。

执行时的提交：`refactor(scripts): dispatch commands through a lazy table`

- 把 `cli.ts` 的 `switch` 改成"命令名 → 处理函数"的查找表，每个处理函数内部
  `await import` 自己的模块。`env`、`doctor`、`clean` 这类命令不再加载
  policy/verification/validation。
- 命令名、参数解析、用法文案、错误信息和退出码保持逐字不变。
- 帮助文案里列出的命令从查找表生成，避免两处维护。
- 验证：scripts 测试、`bun run verify`，并重测 `doctor` 启动时间与阶段 0 对比。

## 9. 阶段 5：文档收尾

提交：`docs(tooling): align workspace guides with the split`

- `packages/tooling/AGENTS.md` 目前 245 行。按新归属拆到 `packages/devkit`、
  `packages/tooling`、`packages/scripts` 三份，各自保持简短，删除已不成立的描述
  （例如 consumer 排除 `src/verification/` 的说明）。
- 更新 `docs/architecture/README.md`、`docs/development/workspaces.md`、`testing.md`、
  `caching.md` 中涉及的内容。
- 所有 Markdown 文件不超过 500 行（`policy` 会检查）。
- 完成后把本文件改写为交付记录 `docs/development/tooling-consolidation.md`
  （参照 `i18n-intl-vendoring.md`），删除本文件，并同步 `docs/README.md` 的索引。

## 10. 完成标准

- 阶段 1–3、5 各一个提交（阶段 4 视数据决定），全部在 `refactor/tooling-consolidation`
  分支上。
- `bun run verify --full` 在当前平台通过。
- 仓库中不再有对 `@raypx-kit/devkit` 的依赖，`@raypx/tooling` 不再有 `./cli` 入口。
- 修改 scripts 私有代码不再使其他 workspace 的 `check` 缓存失效，有阶段 0、
  阶段 2 和阶段 3 的对照数据。
- `raypx-dev` 的命令行为和 CI 计划输出不变，CI 最小安装可运行 `ci:plan`。

最终报告需要包含：

- 各阶段前后的源码/测试行数（按 workspace）。
- 阶段 0 的三个耗时与完成后的对应数值。
- 未执行或无法验证的检查，逐条列出。至少包括 GitHub workflow、Windows/Linux
  平台、PostgreSQL/浏览器/打包原生验收。不得把未运行的平台描述为通过。
- 新增的 `@raypx/tooling` 入口及其理由。
- `exports` 为空、因此不再计入 check 输入的 workspace 名单。
- 阶段 3 中等待所有者确认的两项的影响评估；阶段 4 是否执行及依据。

## 11. 范围之外

- `raypx/raypx-kit` 仓库里 devkit 包的去留（冻结、弃用或继续维护）由所有者另行决定。
- `@raypx-kit/analytics`、`@raypx-kit/email-preview` 和
  `drizzle-kit` 分支包保持外部依赖。
