# i18n 迁入交付记录

从 Raypx Kit 的发布标签导出 `packages/intl`，源提交为
`b928c371393a14b5bdf8d6e9a075fef66eff32ce`。迁入后由 `@raypx/i18n` 独占
`use-intl@4.14.9` 的直接依赖和导入。Tooling 使用开发 catalog 中的
`@formatjs/icu-messageformat-parser@3.5.22` 做静态比对。八个入口和业务导入保持原样。
架构决策见 [ADR 0055](../architecture/0055-in-repo-intl-runtime.md)。

## 行数与产物

| 阶段              | i18n 源码行 | i18n 测试行 | Web 客户端字节 | 客户端 JS 字节（gzip） | 中文 chunk 字节（gzip） |
| ----------------- | ----------: | ----------: | -------------: | ---------------------: | ----------------------: |
| 0 基线 `c89d0f39` |         415 |         688 |      2,407,798 |   2,195,314（713,357） |        41,819（16,007） |
| 1 迁入 `b1c56041` |       1,218 |       1,628 |      2,407,910 |   2,195,426（713,432） |        41,819（16,007） |
| 2 压平 `9cd01549` |         922 |       1,378 |      2,409,881 |   2,197,397（716,855） |        41,819（16,007） |
| 3 文档            |         922 |       1,378 |     沿用阶段 2 |             沿用阶段 2 |              沿用阶段 2 |

源码统计 `packages/i18n/src` 的 TS/TSX，排除测试。测试行包含源码同目录的测试和
`tests/` 中的 TS/TSX 夹具及编译期断言。文案和 JSON 夹具未计入。客户端大小是
`apps/web/.output/public` 的常规文件字节总数，JS gzip 按文件压缩求和。
三个阶段的 `bun run size --package web --require` 均显示整个 Web 输出约 7.72 MiB。
阶段 2 比阶段 1 减少 296 行源码和 250 行测试，比基线增加 2,083 字节客户端产物（0.087%）。
中文资源的文件名和字节数三个阶段一致。

## 验证

- 阶段 0 的 i18n `check`、27 项测试、`i18n:check` 和 `verify` 通过。基线
  `verify` 按当时的文档变更范围选择了 3 个任务。
- 阶段 1 和 2 的 i18n `check` 及 79、58 项测试通过。Tooling 两阶段各通过
  `check` 和 269 项测试。根 `i18n:check`、`policy`、`knip` 和
  `verify` 均通过，两阶段各执行 73 个 VP 验证任务。
- 两阶段构建了 Web、Desktop renderer 和 iOS、Android export。Nitro 首页实际返回
  英文和中文 SSR HTML，cookie 选择优先于请求语言，英文留在静态客户端资源，
  中文为独立 chunk。两个 Mobile export 的 Hermes source map 均含
  `use-intl/core`，i18n 浏览器入口、React 适配器和 React DOM 均未进入产物。
- 两次源码提交的 `exports` 映射和运行时导出名称一致。`tests/types/` 编译通过，
  保留了 catalog 形状、消息 key、ICU 参数和富文本标签的正反断言。
- 阶段 1 将 SDK 的组件测试切到 happy-dom。cookie 删除断言等到模拟时钟推进，
  保留删除结果的断言。为通过 Knip，阶段 1 收回了无消费者的私有导出，
  两阶段均沿用仓库现有的校验配置。
- SDK 的 server 入口在 Raypx 没有消费者，因此未迁入对应的 5 项测试及独立包消费夹具。
- macOS arm64 上的 `bun run verify --full` 通过，83 个 VP 任务成功（67 个缓存命中），
  总耗时 96.7 秒。Web、Relay、后端产物探针和已安装 CLI smoke 通过，Go 检查也通过。

## 阶段 2 合并的测试

| 原用例                                                                          | 保留覆盖的位置                                                                                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| SDK 和产品的区域语言标准化、按权重解析 `Accept-Language`、cookie 往返、请求回退 | `index.test.ts` 保留规范化、权重并列、非法权重、重复 cookie、回退和未类型化参数拒绝。                                                |
| SDK 的偏好解析及系统候选选择                                                    | `preferences.test.ts` 保留精确值、无效值、有序候选、显式覆盖和无效显式偏好。                                                         |
| SDK 的可配置语言列表、独立运行时及 8 个无效工厂配置                             | 工厂随固定产品配置移除。`index.test.ts` 核对固定列表、默认语言、cookie 名及有效期，并继续拒绝无效请求语言回退和 cookie 写入。        |
| SDK 与产品的 SSR 快照恢复、原生快照权威性                                       | 保留 `provider.component.test.tsx` 的对应产品测试，继续核对首屏、hydrate、cookie、HTML lang 和原生写回边界。                         |
| SDK 的旧键迁移及迁移写失败                                                      | 产品从未启用旧键迁移。`provider.component.test.tsx` 覆盖退役键保持原值、当前键优先、写失败后内存选择可用，以及跨窗口清空和重新挂载。 |
| 产品的受控 locale/catalog 同步更新和 UTC/设备时区                               | 合入 `client.component.test.tsx` 的受控 provider 用例，保留快照即时更新、UTC 和显式时区覆盖。                                        |
| 产品的同步命名空间翻译与 plural                                                 | 合入 `translator.test.ts` 的命名空间、plural 和 apostrophe quoting 用例。动态 catalog 的产品入口用例保留。                           |

## 未执行的验收

- 真实浏览器 Playwright E2E。
- Desktop 原生 GUI 和安装包交互。
- iOS 和 Android 真机交互。
- macOS arm64 以外的原生平台，包括 Windows 和 Linux。
- 独立 PostgreSQL/Redis、容器和部署验收矩阵。

SDK 的 Playwright 应用和四项用例未迁入。Raypx 已有浏览器测试涵盖中英文展示、
语言切换、表单保留和偏好持久化。现有浏览器套件没有覆盖以下完整场景。

1. 断言初始 SSR HTML 的语言，在 hydrate 后恢复不同的存储语言，并检查无 hydration 或页面错误。
2. 在一次切换流程中检查 ICU plural 和富文本，同时核对 cookie、localStorage、重载与恢复跟随系统。
3. 通过真实双标签页的 storage event 同步选择，删除存储键后重载仍使用系统偏好。
4. 同一页面的独立受控 provider 与浏览器偏好各自切换语言，彼此不受影响。
