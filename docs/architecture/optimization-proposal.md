# Raypx 架构优化提案

## 当前状态分析

### 基础设施层已完成分离 ✅

- `@voidmix/drizzle` - Drizzle ORM 扩展
- `@voidmix/env` - 环境变量验证
- `@voidmix/intl` - 国际化工具
- `@voidmix/tsconfig` - TypeScript 配置预设

这些包现已从 npm 消费，为其他项目提供可复用的基础能力。

### 依赖关系分析

**Foundation 层（无依赖）:**

- `@raypx/shared` (14 files) - 环境、日志、错误
- `@raypx/ui` (45 files) - UI 原语
- `@raypx/contracts` (12 files) - API 契约
- `@raypx/auth` (1 file) - 认证类型
- `@raypx/i18n` (24 files) - 国际化

**Core 层:**

- `@raypx/core` (16 files) → `shared`
- `@raypx/cache` (5 files) → `shared`
- `@raypx/mail` (22 files) → `i18n`, `shared`

**Adapter 层:**

- `@raypx/client` (9 files) → `contracts`
- `@raypx/agent-ui` (22 files) → `contracts`, `ui`
- `@raypx/storage` (4 files) → `core`
- `@raypx/application` (24 files) → `core`
- `@raypx/db` (43 files) → `core`, `shared`, `application` ⚠️

**Tooling:**

- `@raypx/scripts` (116 files) → `db`, `i18n`, `shared`, `contracts`, `core`

### 发现的问题

#### 1. **循环依赖风险** ⚠️

```
application → core
db → core + application
```

`@raypx/db` 同时依赖 `core` 和 `application`，而 `application` 也依赖 `core`。这虽然不是直接循环，但增加了耦合度。

#### 2. **包职责不清晰**

- `@raypx/auth` 只有 1 个文件，过于碎片化
- `@raypx/cache` 只有 5 个文件，可能过小
- `@raypx/storage` 只有 4 个文件，职责单一

#### 3. **依赖方向违规**

`@raypx/db` 是 adapter 层，但它依赖了同层的 `application`，应该只依赖 `core`。

## 优化建议

### 方案 A: 合并小包（保守）

**合并 `@raypx/auth` → `@raypx/shared`**

- `auth` 只有类型定义，放在 `shared` 更合理
- 减少包数量，简化依赖图

**合并 `@raypx/cache` → `@raypx/shared`**

- Cache 是基础设施能力，属于 foundation 层
- 与 logger、env 放在一起更一致

**影响:**

- ✅ 减少 2 个包
- ✅ 简化依赖关系
- ❌ `shared` 包会稍大（但仍然内聚）

### 方案 B: 修复依赖方向（推荐）

**问题:** `@raypx/db` 不应该依赖 `@raypx/application`

**解决方案:**

1. 将 `db` 中对 `application` 的引用改为接口依赖
2. 让 `application` 实现 `db` 定义的接口
3. 或者将共享类型提升到 `core`

**修改后的依赖:**

```
db → core, shared
application → core, db (只依赖接口)
```

### 方案 C: 提取共享契约包（激进）

创建新包 `@raypx/types`，包含：

- 认证类型（from `auth`）
- 领域类型（from `core` 中的纯类型）
- 数据库接口（from `db` 的接口定义）

**影响:**

- ✅ 清晰的类型依赖链
- ✅ 便于代码生成和工具链
- ❌ 增加一个新包
- ❌ 需要较大重构

## 推荐实施顺序

### Phase 1: 立即执行（低风险）

1. ✅ 已完成：迁移到 `@voidmix` 基础设施
2. 合并 `@raypx/auth` → `@raypx/shared/auth`
3. 合并 `@raypx/cache` → `@raypx/shared/cache`
4. 更新文档和依赖图

### Phase 2: 中期优化（中风险）

1. 修复 `@raypx/db` 和 `@raypx/application` 的循环依赖
2. 审查 `@raypx/storage` 是否应该合并到 `@raypx/application`
3. 清理各包的公开接口，确保最小化导出

### Phase 3: 长期规划（可选）

1. 考虑是否需要 `@raypx/types` 包
2. 评估 `@raypx/scripts` 是否应该独立仓库
3. 提取更多可复用能力到 `@voidmix`

## 指标

### 当前状态

- 工作区数量: 18 (4 apps + 14 packages)
- Foundation 层: 5 包
- Core 层: 3 包
- Adapter 层: 5 包
- Tooling: 1 包
- 依赖深度: 最深 3 层

### Phase 1 目标

- 工作区数量: 16 (4 apps + 12 packages) ✅ 减少 2 个
- Foundation 层: 3 包（合并后）
- 依赖深度: 保持 3 层
- 循环依赖: 0

### Phase 2 目标

- 适配器层依赖关系清晰
- 所有包职责单一且明确
- 公开接口最小化

## 决策记录

需要创建以下 ADR：

- [ ] ADR-0033: Merge auth and cache into shared package
- [ ] ADR-0034: Fix db-application dependency direction
- [ ] ADR-0035: Package boundary refinement principles

## 相关文档

- [Architecture Overview](./README.md)
- [Shared packages](./packages.md)
- [Decision records](./decisions/README.md)
