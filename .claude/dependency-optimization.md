# 依赖管理和包导出优化分析

## 改进 2：优化包导出结构

### 当前状态

**包导出结构良好的包：**

- ✅ `@raypx/client` - 清晰的子路径导出，React 部分独立
- ✅ `@raypx/api` - 模块化导出（health, http, metrics, security, runtime）
- ✅ `@raypx/contracts` - 细粒度导出（health, errors, pagination, auth）
- ✅ `@raypx/env` - 严格的 client/server 分离
- ✅ `@raypx/ui` - 组件级导出，支持 tree-shaking

**需要优化的包：**

- ⚠️ `@raypx/auth` - 只有根导出，可能包含不必要的代码
- ⚠️ `@raypx/db` - 只有根导出和 schema，可以更细粒度
- ⚠️ `@raypx/logger` - 只有根导出
- ⚠️ `@raypx/storage` - 只有根导出和 cache
- ⚠️ `@raypx/worker` - 只有根导出

### 优化建议

#### 1. @raypx/auth - 拆分认证功能

```typescript
// 建议的导出结构
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./adapter": {
    "types": "./dist/adapter.d.ts",
    "import": "./dist/adapter.js"
  },
  "./session": {
    "types": "./dist/session.d.ts",
    "import": "./dist/session.js"
  },
  "./providers": {
    "types": "./dist/providers.d.ts",
    "import": "./dist/providers.js"
  }
}
```

**好处：**

- 独立导入适配器逻辑
- 分离会话管理功能
- 按需加载 provider 配置

#### 2. @raypx/db - 分离迁移和查询

```typescript
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./schema": {
    "types": "./dist/schema.d.ts",
    "import": "./dist/schema.js"
  },
  "./migrations": {
    "types": "./dist/migrations.d.ts",
    "import": "./dist/migrations.js"
  },
  "./client": {
    "types": "./dist/client.d.ts",
    "import": "./dist/client.js"
  }
}
```

**好处：**

- 迁移逻辑独立，生产环境可能不需要
- Schema 定义可独立导入用于类型推断
- 客户端工具分离

#### 3. @raypx/logger - 分离格式化器和传输

```typescript
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./formatters": {
    "types": "./dist/formatters.d.ts",
    "import": "./dist/formatters.js"
  },
  "./transports": {
    "types": "./dist/transports.d.ts",
    "import": "./dist/transports.js"
  }
}
```

**好处：**

- 自定义格式化器可独立导入
- 传输层配置独立

#### 4. @raypx/storage - 分离驱动和缓存

```typescript
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./cache": {
    "types": "./dist/cache.d.ts",
    "import": "./dist/cache.js"
  },
  "./drivers": {
    "types": "./dist/drivers.d.ts",
    "import": "./dist/drivers.js"
  },
  "./instance": {
    "types": "./dist/instance.d.ts",
    "import": "./dist/instance.js"
  }
}
```

**好处：**

- 驱动配置独立
- 实例管理逻辑分离
- 缓存助手独立使用

---

## 改进 3：依赖管理优化

### 依赖分析

#### Catalog 统一管理

当前 catalog 配置：

```json
{
  "vite": "npm:@voidzero-dev/vite-plus-core@1.1.0",
  "vite-plus": "1.1.0",
  "evlog": "2.30.1",
  "better-sqlite3": "11.8.1",
  "drizzle-orm": "0.36.4",
  "better-auth": "1.6.1",
  "unstorage": "1.14.1",
  "ioredis": "5.4.2",
  "vitest": "5.0.3",
  "@vitest/coverage-v8": "5.0.3",
  "@vitest/browser-playwright": "5.0.3",
  "playwright": "1.64.0"
}
```

**优化建议：**

1. 添加更多共享依赖到 catalog
2. 统一 React 生态版本
3. 统一测试工具版本

#### React 生态版本统一

当前状态：

- React: 19.3.0 (在多个包中重复)
- @tanstack/react-query: 5.104.1
- @types/react: ^22.19.0
- @types/react-dom: ^19.2.2

**建议添加到 catalog：**

```json
{
  "react": "19.3.0",
  "react-dom": "19.3.0",
  "@types/react": "^19.2.2",
  "@types/react-dom": "^19.2.2",
  "@tanstack/react-query": "5.104.1"
}
```

#### TypeScript 类型包统一

当前：@types/node 在多个包中重复

**建议：**

```json
{
  "@types/node": "^22.19.0"
}
```

#### 测试工具版本统一

当前：

- jsdom: 29.0.1 (在多个包中重复)
- @testing-library/dom: 10.4.2
- @testing-library/react: 16.3.3

**建议添加到 catalog：**

```json
{
  "jsdom": "29.0.1",
  "@testing-library/dom": "10.4.2",
  "@testing-library/react": "16.3.3",
  "@testing-library/user-event": "^14.6.1"
}
```

### PeerDependencies 优化

#### @raypx/client

当前：

```json
{
  "peerDependencies": {
    "@tanstack/react-query": "^5.104.1",
    "react": "19.3.0"
  },
  "peerDependenciesMeta": {
    "@tanstack/react-query": { "optional": true },
    "react": { "optional": true }
  }
}
```

**分析：** ✅ 合理 - React 依赖标记为 optional，因为核心功能不依赖 React

#### @raypx/ui

当前：

```json
{
  "peerDependencies": {
    "react": "19.3.0",
    "react-dom": "19.3.0"
  }
}
```

**建议：** 使用 peerDependenciesMeta 放宽版本要求

```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  }
}
```

### 重复依赖检查

发现的重复依赖（次要）：

- h3: 出现 2 次
- picomatch: 出现 2 次
- magic-string: 出现 2 次
- semver: 出现 2 次

**说明：** 这些都是间接依赖，由不同的包引入，无需手动优化。

### DevDependencies vs Dependencies

#### 需要检查的包

**@raypx/config：**

- 当前全部在 devDependencies ✅ 正确（工程包）

**@raypx/ui：**

- 所有 Radix UI 包在 dependencies ✅ 正确
- tailwind-merge, clsx 在 dependencies ✅ 正确

**@raypx/client：**

- @raypx/contracts 在 dependencies ✅ 正确
- React 相关在 devDependencies ✅ 正确（peer）

### 实施优先级

**高优先级（立即实施）：**

1. ✅ 添加 React 生态到 catalog
2. ✅ 添加测试工具到 catalog
3. ✅ 添加 @types/node 到 catalog

**中优先级（下一阶段）：**

1. 优化 @raypx/auth 导出结构
2. 优化 @raypx/db 导出结构
3. 优化 @raypx/storage 导出结构

**低优先级（可选）：**

1. 放宽 @raypx/ui 的 React 版本要求
2. 优化 @raypx/logger 导出结构
3. 优化 @raypx/worker 导出结构

---

## 实施步骤

### 步骤 1：扩展 Catalog（立即）

更新 `package.json` 的 catalog：

```json
{
  "catalog": {
    "vite": "npm:@voidzero-dev/vite-plus-core@1.1.0",
    "vite-plus": "1.1.0",
    "evlog": "2.30.1",
    "better-sqlite3": "11.8.1",
    "drizzle-orm": "0.36.4",
    "better-auth": "1.6.1",
    "unstorage": "1.14.1",
    "ioredis": "5.4.2",
    "vitest": "5.0.3",
    "@vitest/coverage-v8": "5.0.3",
    "@vitest/browser-playwright": "5.0.3",
    "playwright": "1.64.0",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "@types/node": "^22.19.0",
    "@tanstack/react-query": "5.104.1",
    "jsdom": "29.0.1",
    "@testing-library/dom": "10.4.2",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "^14.6.1"
  }
}
```

### 步骤 2：更新包使用 Catalog

将各包的依赖改为使用 `catalog:`：

```json
{
  "devDependencies": {
    "react": "catalog:",
    "react-dom": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@types/node": "catalog:",
    "jsdom": "catalog:",
    "@testing-library/dom": "catalog:",
    "@testing-library/react": "catalog:"
  }
}
```

### 步骤 3：运行测试验证

```bash
bun install
bun run test
bun run typecheck
bun run check
```

### 步骤 4：优化包导出（逐步）

按优先级逐个优化包的导出结构。

---

## 预期效果

1. **依赖管理：**
   - 版本统一，减少不一致
   - 更新依赖更简单（只需修改 catalog）
   - 减少 lockfile 冲突

2. **包导出：**
   - 更好的 tree-shaking
   - 更清晰的 API 结构
   - 按需加载，减少包体积

3. **开发体验：**
   - 更清晰的导入路径
   - 更好的 IDE 自动完成
   - 更容易理解模块依赖关系
