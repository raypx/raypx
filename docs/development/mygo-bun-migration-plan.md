# MyGo 与 Bun 分发及验收

本文保留原文件路径，内容已改为当前分发流程；旧宿主回迁计划已完成，不再作为待办。
新 Agent、对话和 Run 由 PostgreSQL 后端拥有；CLI/daemon 仍承载本地设备运行时及
Desktop 私有会话传输，直到对应替换阶段。原生宿主不获得新的 Agent 执行权限。
英文操作入口见 [Desktop 发布指南](desktop.md#build-and-release)。

## 当前工具链

Bun 1.4.4 负责安装、脚本、测试和 CLI 编译；Turbo 是唯一任务图和缓存。
Desktop 使用 MyGo 0.8.3、Go 1.27.3，原生构建设置 `CGO_ENABLED=0`。
macOS 配置最低版本为 13.5，Windows 使用 WebView2；Linux Desktop 验收仍未验证。
源码、浏览器或无界面检查不代表安装包、签名或真实 WebView 已通过。

## 单次编译与完整 payload

每个发布候选、每个平台只编译一次生产 CLI。编译入口为 `apps/cli/src/main.ts`，
嵌入稳定 Bun runtime，使用 minified ESM 和 depth-0 bytecode。
完整目录包含可执行文件、`herdr/`、许可证、说明和 `runtime.json` 完整性清单。
消费者设置 `RAYPX_CLI_PAYLOAD` 并校验清单；缺失产物必须失败，不能隐式重编译。

```sh
bun run build:cli
bun run build:desktop
bun run --cwd apps/desktop mygo:check
bun run --cwd apps/desktop mygo:test
bun run --cwd apps/desktop mygo:smoke
bun run package:desktop
```

CI 在准备阶段对内层 CLI/Herdr 签名，再封存清单。独立 CLI 压缩包与 Desktop
共用该不可变目录；外层应用、安装包和更新归档签名不得改写它。
原生归档由 `apps/cli/scripts/distribution.ts` 消费已准备的目录，附带 SHA-256。
未提供签名凭据的包只能报告为未签名或临时签名，不能声称正式分发通过。

Desktop 只按绝对路径启动版本匹配的 bundled CLI，不导入其源码。
Windows 使用版本化完整副本和运行租约，保留正在使用的版本。
连接器安装、复制和修复均保留所有权检查。原生配置及会话按服务 origin 隔离；
切换账号或服务不能把已注册的设备 profile 转给另一身份，也不导入旧会话存储。

## 独立验收边界

- 默认 `bun run verify` 运行受影响源码和必要 Go 检查，不启动 GUI 或真实推理。
- `bun run verify --full` 增加仓库审计、构建和当前平台产物探针，不替代独立平台门禁。
- `mygo:smoke` 是无界面产物检查；`native:smoke` 使用独立 `native_smoke` 宿主、
  renderer 和临时数据目录。生产构建不包含私有测试控制入口。
- 安装、升级、系统凭据、HTTPS 会话恢复、休眠重连、GUI Quit 后 daemon 生命周期、
  OS 通知及签名需按 macOS/Windows 分别记录。浏览器预览不能证明这些结果。
- Mobile 的源码、原生 mock 和 JS bundle 检查与真实 iOS/Android 设备验收独立，
  未执行的平台保持未验证。参见 [Mobile](mobile.md)。

## 性能与清理

仓库 Strobe 场景只消费已准备产物，使用私有 home、合成配置和所有权标记，保持不缓存。
不得用操作者 profile、停止他人的 daemon，或让 GUI 验收抢占当前工作桌面。
计时终点必须是实际状态/可访问元素，不能用固定 sleep 代替。
记录完整进程集合、平台、架构、产物身份和实际检查范围；测量结果不等于平台发布通过。

`.artifacts/` 只存生成证据。`bun run clean:artifacts` 清报告，不删构建和用户数据；
`bun run clean` 还清构建及缓存。验收清理只停止本次启动的进程、删除本次拥有的资源，
不做全局 prune。历史证据不能替代当前候选的门禁。
