# UI Kit 消融实验

日期：2026-09-17。基线：`b9e3e9e`，保留该提交之后已有的 Desktop 偏好设置改动。

## 方法

实验按“单项修改 → 类型检查和行为测试 → 结构计数 → 决策”进行。视觉统一和删除实验分开统计；源码减少本身不被视为性能收益。

## 结果

| 实验                                                                            | 结果                                                                                             | 判定               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| 删除 Desktop Library、项目进度和旧详情选择器                                    | 当前代码没有生产调用；`App.css` 从 1209 行降至 962 行，选择器计数从 206 降至 168                 | 保留删除           |
| 去掉公共 Button 上的旧 `primary-button`、`secondary-button`、`icon-button` 覆盖 | Button 的 `variant`/`size` 已承担控件外观，页面只保留布局和特殊窗口样式                          | 保留删除           |
| 删除 Desktop 重复主题块及 `--muted` 文本别名                                    | Web/Desktop 共用 `@voidmix/ui` 语义变量，文字改用 `--ink-muted`，`--muted` 恢复为表面语义        | 保留删除           |
| 删除 `CommandInput`                                                             | 无生产调用，只有包内测试和导出；删除实现、测试场景和导出                                         | 保留删除           |
| 内联 Admin `FilterButton`                                                       | 该封装集中 `aria-pressed`、Button variant 和选中状态；静态对照显示内联后调用点会重复维护这些行为 | 拒绝删除，保留封装 |
| 内联 Avatar                                                                     | 多个 Web/Admin/Desktop 调用需要图片回退、姓名缩写、尺寸映射和可访问名称；内联会复制行为          | 拒绝删除，保留封装 |

## 实现记录

- `@voidmix/ui` 新增 Base UI `Switch`，支持受控 `checked`、`onCheckedChange`、`disabled`、标签和小尺寸变体。
- Desktop 设置使用 `Switch`；偏好存储和切换逻辑仍属于 Desktop。
- Web 项目列表和详情使用公共 `Input`、`Button`、`EmptyState`、`StatusBadge`。
- `StatusBadge` 只接受通用视觉 tone，并组合共享 `Badge` 与 Phosphor 图标；项目和任务状态由应用 feature 映射到视觉 tone。
- `PageHeader`、`SectionHeading` 的内部排版不再由 Desktop 旧 CSS 覆盖，页面间距由调用处负责。
- Storybook 新增 Switch 的默认、选中、禁用和交互状态。

## 验证

- `packages/ui` 类型检查通过，组件测试 20 项通过。
- Desktop 类型检查通过，Web 类型检查通过，Storybook 类型检查通过。
- `git diff --check` 无空白错误；`bun run verify`、应用构建均通过。
- 初始 `bun run test:e2e` 为 7 项通过、2 项旧 Project Studio 场景失败；基线同样失败。
  按后续要求移除旧场景、专用 API 夹具和 Playwright 项目配置后，剩余 7 项全部通过。
- 视觉检查重点为 Web 项目列表/详情和 Desktop 设置、首页、设备、活动页；覆盖深浅主题、窄容器、中文长文本、空状态和键盘焦点。

## 边界

项目卡片、Admin 表格、导航、Agent 时间线和数据请求仍由应用拥有。没有为了降低文件数量而创建万能页面组件，也没有把 Tailwind 类字符串集中到新的抽象层。
