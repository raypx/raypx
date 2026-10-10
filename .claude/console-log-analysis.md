# Console.log 替换分析

## 使用场景分析

所有 5 处 console.log 都在 **CLI 工具** 中使用，而非应用代码：

1. **packages/config/src/environment.ts** - 环境检查 CLI
2. **packages/config/src/check-boundaries.ts** - 边界检查 CLI
3. **packages/config/src/check-boundaries-simple.ts** - 简单边界检查 CLI
4. **packages/db/src/cli.ts** - 数据库迁移 CLI
5. **packages/env/src/cli.ts** - 环境验证 CLI

## 决策：保留 console.log

**原因：**

### 1. CLI 工具的标准实践

- CLI 工具直接输出到 stdout/stderr 是标准做法
- `console.log` 语义清晰：成功信息 → stdout
- `console.error` 语义清晰：错误信息 → stderr

### 2. 避免引入不必要的依赖

- 这些是独立的 CLI 工具，不应依赖 `@raypx/logger`
- 引入 logger 会增加启动时间和复杂度
- CLI 工具需要快速启动

### 3. 符合 Unix 哲学

```bash
# 标准用法
vp run check:boundaries > success.log 2> errors.log

# 如果使用 logger，会破坏标准流重定向
```

### 4. 已有的良好实践

```typescript
// packages/db/src/cli.ts
console.log("Database migrations applied"); // stdout - 成功
console.error("Database migration failed..."); // stderr - 失败
process.exitCode = 1; // 错误码
```

## 建议：优化而非替换

### 改进点 1: 统一输出格式

当前输出格式不统一：

```
✓ Workspace boundaries are clean
Development environment passed (Node.js v22.23.3, Bun 1.4.2).
Workspace package boundaries passed.
Database migrations applied
Runtime environment is valid.
```

**建议统一格式：**

```typescript
// 成功消息
✓ Development environment passed (Node.js v22.23.3, Bun 1.4.2)
✓ Workspace boundaries passed
✓ Database migrations applied
✓ Runtime environment validated

// 错误消息
✗ Development environment check failed
✗ Boundary violation: ...
```

### 改进点 2: 添加 --quiet 选项

对于 CI 环境，支持静默模式：

```typescript
const quiet = process.argv.includes("--quiet");
if (!quiet) {
  console.log("✓ Workspace boundaries passed");
}
```

### 改进点 3: 支持 --json 输出

对于工具集成：

```typescript
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ success: true, message: "..." }));
} else {
  console.log("✓ Workspace boundaries passed");
}
```

## 结论

**不替换 console.log**，原因：

- ✅ CLI 工具的标准实践
- ✅ 避免不必要的依赖
- ✅ 符合 Unix 哲学
- ✅ 已有良好的错误处理

**可选改进**（不在当前优先级）：

- 统一输出格式（添加 ✓/✗ 前缀）
- 支持 --quiet 模式
- 支持 --json 输出

建议：**跳过此优化**，专注于更有价值的任务。
