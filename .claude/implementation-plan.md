# Raypx 高优先级改进实施计划

基于 vinext 能力分析，本文档详细规划高优先级改进的具体实施步骤。

---

## 改进 1：统一 Vite+ 配置

### 目标

将 `vitest.config.mts` 的测试配置合并到 `vite.config.ts`，实现单一配置源。

### 当前状态分析

**vitest.config.mts 内容：**

- 定义了 3 个测试项目：web, storage, scripts
- 每个项目有独立的 tsconfig 和 include/exclude 规则
- 使用 `defineProject` 模式

**vite.config.ts 内容：**

- 已有 lint、format、staged 配置
- 缺少 test 配置

### 实施步骤

#### 步骤 1.1：迁移测试配置到 vite.config.ts

```typescript
// vite.config.ts - 添加 test 配置块
export default defineConfig({
  // ... 现有的 staged, fmt, lint 配置

  test: {
    // 全局测试环境变量
    env: {
      NODE_ENV: "test",
    },

    // Reporter 配置
    reporters: process.env.CI ? ["default", "github-actions"] : ["default"],

    // 覆盖率配置
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
      exclude: ["**/*.d.ts", "**/*.test.ts", "**/*.spec.ts", "**/test/**", "**/dist/**"],
    },

    // 多项目配置
    projects: [
      {
        test: {
          name: "web",
          environment: "jsdom",
          globals: true,
          setupFiles: ["apps/web/test/setup.ts"],
          include: ["apps/web/test/**/*.test.ts"],
          exclude: ["apps/web/test/integration/**"],
        },
      },
      {
        test: {
          name: "web-integration",
          environment: "node",
          globals: true,
          include: ["apps/web/test/integration/**/*.test.ts"],
          testTimeout: 30000,
        },
      },
      {
        test: {
          name: "storage",
          environment: "node",
          globals: true,
          include: ["packages/storage/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "scripts",
          environment: "node",
          globals: true,
          include: ["scripts/**/*.test.ts"],
        },
      },
    ],
  },
});
```

#### 步骤 1.2：更新 package.json 脚本

```json
{
  "scripts": {
    "test": "vp test run",
    "test:watch": "vp test",
    "test:web": "vp test run --project web",
    "test:web-integration": "vp test run --project web-integration",
    "test:storage": "vp test run --project storage",
    "test:ui": "vp test run --ui",
    "test:coverage": "vp test run --coverage"
  }
}
```

#### 步骤 1.3：删除 vitest.config.mts

```bash
rm vitest.config.mts
```

#### 步骤 1.4：更新文档

在 `TESTING.md` 中更新测试运行说明：

- 移除 vitest.config.mts 的引用
- 说明所有测试配置现在在 vite.config.ts 中
- 更新测试命令示例

### 验证步骤

```bash
# 1. 确认配置语法正确
vp config

# 2. 运行各个测试项目
vp test run --project web
vp test run --project storage
vp test run --project scripts

# 3. 运行完整测试套件
vp test run

# 4. 确认 CI 通过
git add -A
git commit -m "refactor: unify test configuration in vite.config.ts"
git push
```

### 预期收益

- ✅ 单一配置源，减少维护负担
- ✅ 更容易理解项目配置结构
- ✅ 与 lint、format 配置保持一致

### 风险与缓解

**风险：** 现有测试可能因配置迁移失败  
**缓解：** 先在本地完整运行测试套件，确认通过后再提交

---

## 改进 2：多项目测试分离（Unit/Integration）

### 目标

明确分离快速的单元测试和慢速的集成测试，优化反馈循环。

### 当前状态分析

**现有测试分布：**

- `apps/web/test/integration/` - 已有集成测试目录
- `packages/storage/test/` - 混合了单元和集成测试
- 没有明确的 unit/integration 命名约定

### 实施步骤

#### 步骤 2.1：重组测试目录结构

```bash
# Web 应用测试
apps/web/test/
├── unit/           # 新增：纯逻辑测试
├── integration/    # 现有：需要服务器的测试
├── fixtures/       # 测试数据
└── helpers/        # 测试工具

# Storage 包测试
packages/storage/test/
├── unit/           # 新增：纯逻辑测试
├── integration/    # 新增：需要真实 I/O 的测试
└── fixtures/
```

#### 步骤 2.2：更新 vite.config.ts 测试项目定义

```typescript
test: {
  projects: [
    // === Unit Tests (快速，无外部依赖) ===
    {
      test: {
        name: 'unit',
        environment: 'node',
        globals: true,
        include: [
          'apps/*/test/unit/**/*.test.ts',
          'packages/*/test/unit/**/*.test.ts',
          'scripts/**/*.test.ts',
        ],
        // 单元测试应该快速完成
        testTimeout: 5000,
      },
    },

    // === Integration Tests (慢速，需要服务器/数据库) ===
    {
      test: {
        name: 'integration',
        environment: 'node',
        globals: true,
        include: [
          'apps/*/test/integration/**/*.test.ts',
          'packages/*/test/integration/**/*.test.ts',
        ],
        // 集成测试允许更长时间
        testTimeout: 30000,
        // 限制并行度避免资源竞争
        maxWorkers: 3,
        fileParallelism: true,
      },
    },

    // === UI Tests (需要 jsdom) ===
    {
      test: {
        name: 'ui',
        environment: 'jsdom',
        globals: true,
        setupFiles: ['apps/web/test/setup.ts'],
        include: [
          'apps/web/src/**/*.test.tsx',
          'packages/ui/src/**/*.test.tsx',
        ],
      },
    },
  ],
}
```

#### 步骤 2.3：迁移现有测试

**识别并迁移测试：**

```bash
# 1. 识别纯单元测试（无 HTTP、数据库、文件系统操作）
# 移动到 test/unit/

# 2. 识别集成测试（启动服务器、访问文件系统）
# 移动到 test/integration/

# 3. 识别 UI 组件测试
# 保持在 src/ 旁边，以 .test.tsx 命名
```

**具体迁移示例：**

```bash
# Web 测试迁移
mkdir -p apps/web/test/unit
mv apps/web/test/server.test.ts apps/web/test/unit/

# Storage 测试迁移
mkdir -p packages/storage/test/unit
mkdir -p packages/storage/test/integration
mv packages/storage/test/import.test.ts packages/storage/test/unit/
mv packages/storage/test/instance.test.ts packages/storage/test/integration/
```

#### 步骤 2.4：更新 package.json 脚本

```json
{
  "scripts": {
    "test": "vp test run --project unit",
    "test:unit": "vp test run --project unit",
    "test:integration": "vp test run --project integration",
    "test:ui": "vp test run --project ui",
    "test:all": "vp test run",
    "test:watch": "vp test --project unit"
  }
}
```

#### 步骤 2.5：更新 CI 配置

```yaml
# .github/workflows/ci.yml
jobs:
  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: bun run test:unit

  test-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: bun run test:integration

  test-ui:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: bun run test:ui
```

### 验证步骤

```bash
# 1. 单元测试应该非常快（< 30秒）
time vp test run --project unit

# 2. 集成测试可以更慢
time vp test run --project integration

# 3. 所有测试应该通过
vp test run --project unit
vp test run --project integration
vp test run --project ui

# 4. 确认测试没有遗漏
vp test run
```

### 预期收益

- ✅ 更快的开发反馈（unit tests < 30s）
- ✅ 更好的测试隔离（避免资源竞争）
- ✅ CI 可以并行运行不同类型的测试
- ✅ 开发者可以只运行相关测试

### 风险与缓解

**风险：** 测试分类可能不准确  
**缓解：** 在 TESTING.md 中明确定义单元测试和集成测试的边界

---

## 改进 3：创建 Oxlint 自定义插件

### 目标

创建自定义 lint 插件强制执行 raypx 的架构边界，提供实时反馈。

### 当前状态分析

**现有边界检查：**

- `check:boundaries` 使用 TypeScript AST
- 只在 CI 或手动运行时检查
- 没有编辑器集成

### 实施步骤

#### 步骤 3.1：创建 oxlint-plugins 目录

```bash
mkdir -p oxlint-plugins
```

#### 步骤 3.2：创建第一个插件 - enforce-public-exports

**目标：** 防止跨包导入使用内部路径（src/, dist/）

```typescript
// oxlint-plugins/enforce-public-exports.ts
import type { RuleContext, ASTNode } from "@oxlint/types";

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce using public exports for workspace dependencies",
      category: "Best Practices",
    },
    messages: {
      privateImport:
        "Do not import from {{package}}/src or {{package}}/dist. Use public exports from {{package}}.",
    },
  },

  create(context: RuleContext) {
    return {
      ImportDeclaration(node: ASTNode) {
        const source = node.source.value;

        // 检查是否导入了 @raypx/*/src 或 @raypx/*/dist
        const privatePathRegex = /^@raypx\/[^/]+\/(src|dist)\//;

        if (privatePathRegex.test(source)) {
          const packageName = source.split("/").slice(0, 2).join("/");
          context.report({
            node: node.source,
            messageId: "privateImport",
            data: { package: packageName },
          });
        }
      },
    };
  },
};
```

#### 步骤 3.3：创建第二个插件 - no-server-in-client

**目标：** 防止客户端代码导入服务端包

```typescript
// oxlint-plugins/no-server-in-client.ts
import type { RuleContext, ASTNode } from "@oxlint/types";
import path from "node:path";

const SERVER_PACKAGES = [
  "@raypx/db",
  "@raypx/auth",
  "@raypx/storage",
  "@raypx/logger",
  "@raypx/worker",
  "@raypx/api",
  "@raypx/env/server",
];

const CLIENT_DIRECTORIES = [
  "apps/web/src/features",
  "apps/web/src/components",
  "packages/ui/src",
  "packages/client/src",
];

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Prevent client code from importing server packages",
      category: "Best Practices",
    },
    messages: {
      serverInClient:
        "Cannot import server package {{package}} in client code. Use API routes or server functions.",
    },
  },

  create(context: RuleContext) {
    const filename = context.getFilename();

    // 检查当前文件是否在客户端目录
    const isClientFile = CLIENT_DIRECTORIES.some((dir) => filename.includes(dir));

    if (!isClientFile) {
      return {};
    }

    return {
      ImportDeclaration(node: ASTNode) {
        const source = node.source.value;

        // 检查是否导入了服务端包
        if (SERVER_PACKAGES.some((pkg) => source.startsWith(pkg))) {
          context.report({
            node: node.source,
            messageId: "serverInClient",
            data: { package: source },
          });
        }
      },
    };
  },
};
```

#### 步骤 3.4：创建第三个插件 - prefer-workspace-alias

**目标：** 强制使用 workspace 别名而非相对路径

```typescript
// oxlint-plugins/prefer-workspace-alias.ts
import type { RuleContext, ASTNode } from "@oxlint/types";
import path from "node:path";

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer workspace aliases over relative imports",
      category: "Best Practices",
    },
    messages: {
      useAlias: "Use workspace alias {{alias}} instead of relative import",
    },
  },

  create(context: RuleContext) {
    const filename = context.getFilename();

    return {
      ImportDeclaration(node: ASTNode) {
        const source = node.source.value;

        // 检查是否是相对路径跨包导入
        if (!source.startsWith(".")) {
          return;
        }

        const resolvedPath = path.resolve(path.dirname(filename), source);

        // 检查是否跨越了包边界
        const currentPackage = getPackageRoot(filename);
        const targetPackage = getPackageRoot(resolvedPath);

        if (currentPackage !== targetPackage && targetPackage) {
          const alias = getWorkspaceAlias(targetPackage);
          if (alias) {
            context.report({
              node: node.source,
              messageId: "useAlias",
              data: { alias },
            });
          }
        }
      },
    };
  },
};

function getPackageRoot(filepath: string): string | null {
  // 实现查找包根目录的逻辑
  const match = filepath.match(/(packages|apps)\/([^/]+)/);
  return match ? match[0] : null;
}

function getWorkspaceAlias(packagePath: string): string | null {
  // packages/client -> @raypx/client
  // apps/web -> 不使用别名
  const match = packagePath.match(/packages\/([^/]+)/);
  return match ? `@raypx/${match[1]}` : null;
}
```

#### 步骤 3.5：在 vite.config.ts 中注册插件

```typescript
// vite.config.ts
export default defineConfig({
  lint: {
    jsPlugins: [
      "./oxlint-plugins/enforce-public-exports.ts",
      "./oxlint-plugins/no-server-in-client.ts",
      "./oxlint-plugins/prefer-workspace-alias.ts",
    ],
    rules: {
      "raypx/enforce-public-exports": "error",
      "raypx/no-server-in-client": "error",
      "raypx/prefer-workspace-alias": "warn", // 警告而非错误
    },
    overrides: [
      {
        // 测试文件允许导入内部路径
        files: ["**/*.test.ts", "**/*.test.tsx"],
        rules: {
          "raypx/enforce-public-exports": "off",
        },
      },
    ],
  },
});
```

#### 步骤 3.6：更新 CLAUDE.md

在 CLAUDE.md 中添加自定义 lint 规则说明：

````markdown
## 自定义 Lint 规则

Raypx 使用自定义 Oxlint 插件强制执行架构边界：

### raypx/enforce-public-exports

跨包导入必须使用公共导出，不能直接导入 `src/` 或 `dist/`。

❌ 错误：

```typescript
import { helper } from "@raypx/client/src/utils";
```
````

✅ 正确：

```typescript
import { helper } from "@raypx/client";
```

### raypx/no-server-in-client

客户端代码不能导入服务端包。

❌ 错误：

```typescript
// 在 apps/web/src/components/Button.tsx 中
import { db } from "@raypx/db";
```

✅ 正确：

```typescript
// 使用 API routes 或 server functions
const data = await fetch("/api/data");
```

### raypx/prefer-workspace-alias

跨包导入优先使用 workspace 别名。

⚠️ 警告：

```typescript
import { Button } from "../../../packages/ui/src/button";
```

✅ 推荐：

```typescript
import { Button } from "@raypx/ui/button";
```

````

### 验证步骤

```bash
# 1. 确认插件语法正确
vp check

# 2. 运行 lint 验证插件工作
vp lint

# 3. 故意违反规则，确认能捕获
# 在某个文件中添加：import { x } from '@raypx/client/src/utils';
vp lint

# 4. 确认编辑器集成（如果支持）
# 打开 VS Code，检查是否显示 lint 错误
````

### 预期收益

- ✅ 实时的架构边界检查（在编辑器中）
- ✅ 更快的反馈（不需要运行 check:boundaries）
- ✅ 更好的开发者体验
- ✅ 减少 PR 中的边界违规

### 风险与缓解

**风险：** 自定义插件可能有 bug  
**缓解：** 先以 'warn' 级别运行，观察一段时间后再改为 'error'

---

## 改进 4：扩展 CLAUDE.md

### 目标

将 CLAUDE.md 从配置说明扩展为全面的 AI agent 开发指南。

### 当前状态分析

**现有内容：**

- 项目状态说明
- 代码放置规则
- 工程约定
- 常见修改流程
- 验证和运行时

**缺失内容：**

- 开发工作流步骤
- 测试策略
- 架构陷阱
- Git 工作流
- 常见问题排查

### 实施步骤

#### 步骤 4.1：添加 "开发工作流" 章节

在 CLAUDE.md 中添加：

```markdown
## 开发工作流

### 添加新功能

1. **评估功能位置**
   - 产品特定功能 → `apps/web/src/features/<feature>/`
   - 可复用数据能力 → 先在 feature 中实现，确认复用后再提升到 `packages/`
   - UI 组件 → `packages/ui/src/`
   - 服务端能力 → `packages/api` 或其他服务端包

2. **创建功能目录**（如果是新 feature）
```

apps/web/src/features/user-profile/
├── components/ # React 组件
├── hooks/ # 数据 hooks
├── contracts/ # Zod schemas (如果需要)
└── routes/ # Start routes

````

3. **编写测试优先**
- 先写测试用例
- 使用 `vp test --project unit` 快速迭代
- 在 `test/unit/` 中添加单元测试

4. **实现功能**
- 遵循现有代码风格
- 使用 TypeScript strict mode
- 避免 `any` 类型

5. **验证**
```bash
vp test run --project unit    # 单元测试
vp check                      # 格式、lint、类型检查
vp run dev                    # 本地验证
````

6. **提交**
   ```bash
   git add -A
   git commit -m "feat(user-profile): add profile editing"
   git push
   ```

### 修复 Bug

1. **复现问题**
   - 在本地环境重现 bug
   - 确认错误消息和堆栈跟踪

2. **编写失败的测试**
   - 创建能复现 bug 的测试用例
   - 确认测试失败

3. **修复代码**
   - 定位问题根源
   - 实施最小化修复
   - 避免过度重构

4. **验证修复**

   ```bash
   vp test run --project unit    # 确认测试通过
   vp test run                   # 运行完整测试套件
   vp check                      # 确认没有破坏其他地方
   ```

5. **检查相关代码**
   - 同样的 bug 是否存在于其他地方？
   - 是否需要在其他环境（dev/prod）中测试？

### 添加依赖

**运行时依赖：**

```bash
bun add <package> --workspace <workspace-name>
```

**开发依赖：**

```bash
bun add -D <package> # 在 root
bun add -D <package> --workspace <workspace-name> # 在特定包
```

**规则：**

- 优先使用现有依赖
- 评估包大小和维护状态
- 更新 `docs/dependencies.md`（如果是重要依赖）

### 提升代码到共享包

**何时提升：**

- ✅ 在多个 feature 中使用
- ✅ 有稳定的 API
- ✅ 有完整的测试
- ✅ 有清晰的文档

**何时不提升：**

- ❌ 只在一个产品中使用
- ❌ API 还在快速变化
- ❌ 包含产品特定逻辑

**提升步骤：**

1. 确认代码稳定且被复用
2. 移动到合适的 `packages/` 目录
3. 添加公共导出到 `index.ts`
4. 添加或更新测试
5. 更新调用方导入路径
6. 运行 `vp check` 确认边界正确

````

#### 步骤 4.2：添加 "测试策略" 章节

```markdown
## 测试策略

### 何时运行哪些测试

**开发时（快速反馈）：**
```bash
vp test --project unit          # 只运行单元测试（< 30s）
vp test --project unit -t "feature name"  # 运行特定测试
````

**提交前（完整验证）：**

```bash
vp test run                     # 运行所有测试
vp check                        # 格式、lint、类型、测试
```

**CI（自动化）：**

- 单元测试、集成测试、UI 测试并行运行
- 所有检查必须通过才能合并

### 测试类型

**单元测试（test/unit/）：**

- 纯函数逻辑
- 数据转换
- 验证逻辑
- Mock 外部依赖（HTTP、数据库、文件系统）
- 应该非常快（< 5s per file）

**集成测试（test/integration/）：**

- 启动真实服务器
- 测试 HTTP endpoints
- 测试数据库交互
- 测试文件系统操作
- 允许较长时间（< 30s per file）

**UI 测试（\*.test.tsx）：**

- React 组件渲染
- 用户交互
- 状态管理
- 使用 jsdom 环境

### 编写好的测试

**DO:**

- ✅ 使用描述性的测试名称
- ✅ 一个测试一个断言（尽可能）
- ✅ 使用 arrange-act-assert 模式
- ✅ Mock 外部依赖
- ✅ 清理资源（afterEach, afterAll）

**DON'T:**

- ❌ 测试实现细节
- ❌ 测试第三方库
- ❌ 使用随机数据（使用固定 fixtures）
- ❌ 在单元测试中访问网络或数据库
- ❌ 添加占位测试（空的 describe）

### 测试示例

**单元测试示例：**

```typescript
// packages/client/src/validation.test.ts
import { describe, it, expect } from "vitest";
import { validateEmail } from "./validation";

describe("validateEmail", () => {
  it("returns true for valid email", () => {
    expect(validateEmail("user@example.com")).toBe(true);
  });

  it("returns false for invalid email", () => {
    expect(validateEmail("not-an-email")).toBe(false);
  });
});
```

**集成测试示例：**

```typescript
// apps/web/test/integration/api.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startDevServer } from "../helpers/server";

describe("API endpoints", () => {
  let server;
  let url;

  beforeAll(async () => {
    const result = await startDevServer();
    server = result.server;
    url = result.url;
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /api/health returns 200", async () => {
    const res = await fetch(`${url}/api/health`);
    expect(res.status).toBe(200);
  });
});
```

````

#### 步骤 4.3：添加 "架构原则与陷阱" 章节

```markdown
## 架构原则与陷阱

### 包边界规则

**依赖方向：**
````

apps/web
↓
packages/client, packages/ui
↓
packages/contracts

````

**禁止的依赖：**
- ❌ packages 不能依赖 apps
- ❌ 不能形成循环依赖
- ❌ client 和 ui 不能依赖服务端包
- ❌ 不能导入其他包的 src/ 或 dist/

**验证：**
```bash
vp run check:boundaries  # 检查边界违规
vp lint                  # 自定义 lint 规则也会检查
````

### 客户端/服务端分离

**服务端专用包：**

- `@raypx/db`, `@raypx/auth`, `@raypx/storage`, `@raypx/logger`, `@raypx/worker`, `@raypx/api`
- `@raypx/env/server`

**浏览器安全包：**

- `@raypx/client`, `@raypx/ui`, `@raypx/contracts`
- `@raypx/env/client`

**混合使用：**

- `apps/web` 可以在 `.server.ts` 文件中使用服务端包
- Start 的导入保护会确保服务端代码不泄漏到浏览器

### SSR 注意事项

**陷阱 1：Module Scope 的副作用**

```typescript
// ❌ 错误：模块加载时访问 localStorage
const theme = localStorage.getItem("theme");

// ✅ 正确：在组件中访问
function App() {
  const theme = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
}
```

**陷阱 2：共享的模块级状态**

```typescript
// ❌ 错误：模块级的 QueryClient 会在 SSR 请求间共享
import { QueryClient } from "@tanstack/react-query";
const queryClient = new QueryClient();

// ✅ 正确：每个请求创建新的 QueryClient
// （web/src/routes/__root.tsx 已正确处理）
```

**陷阱 3：Node 内置模块**

```typescript
// ❌ 错误：在浏览器代码中导入 Node 内置模块
import fs from "node:fs";

// ✅ 正确：只在 .server.ts 文件中使用
// apps/web/src/routes/api.server.ts
import fs from "node:fs";
```

### 性能原则

**最小化客户端包：**

- 避免在客户端组件中导入大型库
- 使用动态导入延迟加载 heavy 组件
- 检查 bundle 大小：`vp run build` 后查看输出

**服务端按需导入：**

```typescript
// ✅ 好：按需导入 heavy 功能
export async function action() {
  if (needsImageProcessing) {
    const { processImage } = await import("./image-processor");
    await processImage();
  }
}
```

**避免 Module Scope 的重工作：**

```typescript
// ❌ 错误：每次导入都执行
const data = expensiveComputation();

// ✅ 正确：延迟到使用时
let _data: Data | undefined;
export function getData() {
  if (!_data) _data = expensiveComputation();
  return _data;
}
```

### Provider 生命周期

**激活规则：**

- Provider 需要显式激活（`activate()`）
- 实现 `ready()` 方法检查就绪状态
- 实现 `dispose()` 方法清理资源
- 失败测试必须验证错误处理

**示例参考：**

```typescript
// packages/storage/src/instance.ts
```

````

#### 步骤 4.4：添加 "Git 工作流" 章节

```markdown
## Git 工作流

### 分支策略

**主分支：** `main`
- 受保护，不能直接推送
- 所有 PR 必须通过 CI 检查
- 使用 squash merge

**功能分支命名：**
```bash
feat/<feature-name>      # 新功能
fix/<bug-description>    # Bug 修复
refactor/<scope>         # 重构
docs/<topic>             # 文档更新
chore/<task>             # 工程任务
````

### Commit Message 规范

使用 Conventional Commits：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type:**

- `feat`: 新功能
- `fix`: Bug 修复
- `refactor`: 重构（不改变行为）
- `docs`: 文档
- `test`: 测试
- `chore`: 工程任务
- `perf`: 性能优化

**Scope:**

- 包名：`client`, `ui`, `api`, `db`, `auth`, `storage`, `logger`, `worker`, `env`, `config`
- 应用名：`web`
- 功能模块：`user-profile`, `dashboard`

**示例：**

```bash
feat(client): add request timeout configuration
fix(web): resolve hydration mismatch in dashboard
refactor(storage): simplify instance lifecycle
docs(readme): update installation instructions
test(api): add middleware integration tests
chore(deps): upgrade @tanstack/react-query to v6
```

### PR 工作流

1. **创建分支**

   ```bash
   git checkout -b feat/new-feature
   ```

2. **开发和提交**

   ```bash
   git add -A
   git commit -m "feat(scope): description"
   ```

3. **推送分支**

   ```bash
   git push -u origin feat/new-feature
   ```

4. **创建 PR**

   ```bash
   gh pr create --fill
   ```

   或手动填写：
   - 标题：与主要 commit 一致
   - 描述：说明改动内容、为什么改、如何测试

5. **等待 CI**
   - 所有检查必须通过（✅ 绿色）
   - 如果失败，修复后推送更新

6. **Code Review**
   - 响应评审意见
   - 推送修复后的代码

7. **合并**
   ```bash
   gh pr merge --squash --delete-branch
   ```

### 常见 Git 任务

**更新分支：**

```bash
git checkout main
git pull
git checkout feat/my-feature
git rebase main
```

**修改最后一次 commit：**

```bash
git add -A
git commit --amend --no-edit
git push --force-with-lease
```

**撤销本地更改：**

```bash
git checkout .           # 撤销未暂存的更改
git reset HEAD <file>    # 取消暂存
git reset --hard HEAD    # 撤销所有更改（危险！）
```

### Git 规则

**DO:**

- ✅ 在功能分支上工作
- ✅ 编写清晰的 commit message
- ✅ 保持 commit 原子化（一个逻辑改动）
- ✅ 在推送前运行 `vp check`
- ✅ 使用 `--force-with-lease` 而非 `--force`

**DON'T:**

- ❌ 直接推送到 main
- ❌ 提交 `node_modules/` 或 `dist/`
- ❌ 提交敏感信息（密钥、token）
- ❌ 使用 `git add .` 而不检查更改
- ❌ 在 commit 中混合无关更改

````

#### 步骤 4.5：添加 "常见问题排查" 章节

```markdown
## 常见问题排查

### 构建失败

**症状：** `vp run build` 失败

**检查清单：**
1. 运行 `vp check` 确认没有类型错误
2. 检查是否有循环依赖
3. 确认所有导入路径正确
4. 查看完整错误堆栈

**常见原因：**
- TypeScript 类型错误
- 缺少依赖
- 配置文件错误

### 测试失败

**症状：** 测试运行失败或超时

**检查清单：**
1. 确认测试独立运行是否通过：`vp test run <file>`
2. 检查是否有资源泄漏（未关闭的服务器、连接）
3. 查看测试超时设置
4. 检查是否有竞态条件

**常见原因：**
- 测试间共享状态
- 异步操作未正确等待
- Mock 未正确设置或清理

### 类型检查失败

**症状：** `vp check:types` 报错

**检查清单：**
1. 运行 `bun install` 确保依赖最新
2. 检查 `tsconfig.json` 继承链
3. 确认导入路径使用 workspace 别名
4. 查看是否有 `any` 类型泄漏

**常见原因：**
- 缺少类型声明
- tsconfig 配置错误
- 循环类型引用

### 边界检查失败

**症状：** `vp run check:boundaries` 报错

**检查清单：**
1. 查看错误消息，确认违规的导入
2. 检查是否在客户端代码导入服务端包
3. 确认是否使用公共导出而非内部路径
4. 运行 `vp lint` 查看自定义规则

**常见违规：**
```typescript
// ❌ 错误示例
import { db } from '@raypx/db';  // 在客户端代码中
import { helper } from '@raypx/client/src/utils';  // 内部路径
````

### 依赖安装问题

**症状：** `bun install` 失败或依赖缺失

**解决方案：**

```bash
# 清理并重新安装
rm -rf node_modules
rm bun.lock
bun install --frozen-lockfile

# 如果仍然失败
bun run setup  # 运行项目设置脚本
```

### 开发服务器问题

**症状：** `vp run dev` 启动失败或白屏

**检查清单：**

1. 检查端口是否被占用：`lsof -i :5173`
2. 查看浏览器控制台错误
3. 检查 `.env` 文件配置
4. 清理缓存：`rm -rf .vinext node_modules/.vite`

### 寻求帮助

如果以上都无法解决问题：

1. **检查相关文档：**
   - `README.md` - 项目概览
   - `TESTING.md` - 测试指南
   - `ENV.md` - 环境变量
   - `ARCHITECTURE.md` - 架构说明

2. **查看已知问题：**
   - GitHub Issues
   - 最近的 PR

3. **提供详细信息：**
   - 完整的错误消息
   - 复现步骤
   - 环境信息：`vp env doctor`（如果可用）

````

### 验证步骤

```bash
# 1. 确认 markdown 语法正确
vp run check:policy  # 应该验证 markdown 格式

# 2. 在 AI 工具中测试新文档
# 打开项目，让 Claude 或其他 AI 助手读取 CLAUDE.md
# 询问一些问题，验证 AI 能够正确理解和引用新内容

# 3. 请团队成员审查
# 确保内容清晰、准确、有用
````

### 预期收益

- ✅ 更有效的 AI agent 辅助开发
- ✅ 新贡献者更快上手
- ✅ 减少重复的问题和错误
- ✅ 团队知识共享

### 风险与缓解

**风险：** 文档可能过时  
**缓解：** 在 PR 模板中添加"是否需要更新 CLAUDE.md"检查项

---

## 改进 5：优化 Policy Checks（增强现有能力）

### 目标

增强现有的 policy check 框架，添加更多自动化检查。

### 当前状态分析

Raypx 已有 `scripts/lib/policy/` 实现：

- Workspace 注册检查
- TypeScript 继承检查
- 本地文档检查
- 边界检查（TypeScript AST）

### 实施步骤

#### 步骤 5.1：添加包大小预算检查

```typescript
// scripts/lib/policy/bundle-size.ts
import fs from "node:fs";
import path from "node:path";
import { gzipSizeSync } from "gzip-size";

interface BudgetConfig {
  package: string;
  maxSize: number; // in KB
}

const BUDGETS: BudgetConfig[] = [
  { package: "@raypx/client", maxSize: 50 },
  { package: "@raypx/ui", maxSize: 100 },
  { package: "@raypx/contracts", maxSize: 20 },
];

export async function checkBundleSize(): Promise<boolean> {
  let hasViolations = false;

  for (const budget of BUDGETS) {
    const distPath = path.join("packages", budget.package.replace("@raypx/", ""), "dist");

    if (!fs.existsSync(distPath)) {
      console.warn(`⚠️  ${budget.package}: dist/ not found, skipping size check`);
      continue;
    }

    const totalSize = calculateDirSize(distPath);
    const totalKB = totalSize / 1024;

    if (totalKB > budget.maxSize) {
      console.error(
        `❌ ${budget.package}: ${totalKB.toFixed(2)} KB exceeds budget of ${budget.maxSize} KB`,
      );
      hasViolations = true;
    } else {
      console.log(`✅ ${budget.package}: ${totalKB.toFixed(2)} KB (budget: ${budget.maxSize} KB)`);
    }
  }

  return !hasViolations;
}

function calculateDirSize(dir: string): number {
  let size = 0;
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      size += calculateDirSize(filePath);
    } else if (file.name.endsWith(".js") || file.name.endsWith(".mjs")) {
      const content = fs.readFileSync(filePath);
      size += gzipSizeSync(content);
    }
  }

  return size;
}
```

#### 步骤 5.2：添加循环依赖检查

```typescript
// scripts/lib/policy/circular-deps.ts
import { execSync } from "node:child_process";

export async function checkCircularDependencies(): Promise<boolean> {
  try {
    // 使用 madge 检测循环依赖
    const output = execSync("npx madge --circular --extensions ts,tsx apps packages", {
      encoding: "utf-8",
      stdio: "pipe",
    });

    if (output.trim()) {
      console.error("❌ Circular dependencies detected:");
      console.error(output);
      return false;
    }

    console.log("✅ No circular dependencies found");
    return true;
  } catch (error) {
    console.error("❌ Error checking circular dependencies:", error);
    return false;
  }
}
```

#### 步骤 5.3：更新 policy 命令入口

```typescript
// scripts/commands/policy.ts
import { checkBundleSize } from '../lib/policy/bundle-size';
import { checkCircularDependencies } from '../lib/policy/circular-deps';

// 在现有检查后添加：
const bundleSizeOk = await checkBundleSize();
const circularDepsOk = await checkCircularDependencies();

// 更新最终结果
const allPassed = /* ...existing checks... */ && bundleSizeOk && circularDepsOk;
```

#### 步骤 5.4：在 CI 中运行 policy checks

```yaml
# .github/workflows/ci.yml
jobs:
  policy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - name: Build packages
        run: bun run build
      - name: Run policy checks
        run: bun run check:policy
```

### 验证步骤

```bash
# 1. 运行新的检查
bun run build
bun run check:policy

# 2. 故意创建违规，确认能检测到
# - 添加循环依赖
# - 增加包大小

# 3. 确认 CI 集成
git add -A
git commit -m "chore(policy): add bundle size and circular deps checks"
git push
```

### 预期收益

- ✅ 自动化的包大小管理
- ✅ 防止循环依赖
- ✅ 更高的代码库质量

---

## 总体实施时间线

### Week 1: 配置统一和测试重组

- **Day 1-2:** 改进 1 - 统一 Vite+ 配置
- **Day 3-5:** 改进 2 - 多项目测试分离

### Week 2: Lint 增强和文档扩展

- **Day 1-3:** 改进 3 - 创建 Oxlint 自定义插件
- **Day 4-5:** 改进 4 - 扩展 CLAUDE.md

### Week 3: Policy 增强和验证

- **Day 1-2:** 改进 5 - 优化 Policy Checks
- **Day 3-5:** 全面测试和文档更新

---

## 验收标准

### 改进 1 完成标志

- [ ] `vitest.config.mts` 已删除
- [ ] `vite.config.ts` 包含完整的 test 配置
- [ ] 所有测试脚本已更新
- [ ] CI 通过

### 改进 2 完成标志

- [ ] 测试目录按 unit/integration 重组
- [ ] vite.config.ts 定义了多个测试项目
- [ ] 单元测试运行时间 < 30s
- [ ] CI 并行运行不同类型的测试

### 改进 3 完成标志

- [ ] 创建了 3+ 个自定义 Oxlint 插件
- [ ] 插件在 vite.config.ts 中注册
- [ ] CLAUDE.md 记录了自定义规则
- [ ] 编辑器能显示 lint 错误

### 改进 4 完成标志

- [ ] CLAUDE.md 增加了 5+ 个新章节
- [ ] 包含开发工作流、测试策略、架构原则、Git 工作流
- [ ] 包含常见问题排查
- [ ] 团队审查通过

### 改进 5 完成标志

- [ ] 添加了包大小预算检查
- [ ] 添加了循环依赖检查
- [ ] policy checks 在 CI 中运行
- [ ] 所有检查通过

---

## 风险管理

### 高风险项

1. **测试配置迁移** - 可能破坏现有测试
   - 缓解：先在本地完整验证，创建备份分支

2. **自定义 lint 插件** - 可能有误报
   - 缓解：先以 'warn' 运行，观察后再改为 'error'

### 中风险项

3. **测试目录重组** - 可能遗漏测试文件
   - 缓解：使用 git mv 保持历史，仔细审查 include/exclude

4. **CLAUDE.md 扩展** - 可能信息过载
   - 缓解：结构化组织，添加目录导航

### 回滚计划

每个改进独立提交，如果出现问题可以单独回滚：

```bash
git revert <commit-hash>
```

---

## 成功指标

**量化指标：**

- 单元测试反馈时间从 2 分钟降至 < 30 秒
- 边界违规在编辑器中实时发现（无需运行 check:boundaries）
- 新贡献者上手时间减少 50%（通过问卷调查）

**定性指标：**

- AI agent 更有效地理解和操作代码库
- 开发者满意度提升
- 代码审查时发现的边界违规减少

---

## 后续改进建议

完成高优先级改进后，可以考虑：

1. **集成更多 Vite+ 能力**
   - 使用 Vite+ tasks 替代部分 package.json scripts
   - 探索 Vite+ 的其他工具链集成

2. **增强测试基础设施**
   - 添加 visual regression tests
   - 设置 E2E 测试框架

3. **文档持续改进**
   - 添加架构决策记录（ADR）
   - 创建视频教程

4. **监控和可观测性**
   - 添加性能监控
   - 设置错误追踪

---

## 总结

本实施计划提供了清晰的路径，将 vinext 的高价值工程实践应用到 raypx。

**关键原则：**

- 渐进式实施，每个改进独立验证
- 保持向后兼容，避免破坏性变更
- 持续验证，确保所有检查通过
- 文档先行，让变更易于理解

**预期成果：**

- 更快的开发反馈循环
- 更好的代码质量保证
- 更友好的开发者体验
- 更有效的 AI 辅助开发
