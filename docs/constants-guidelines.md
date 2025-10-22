# 常量定义规范

## 概述

本文档定义了 Raypx 项目中常量定义的标准规范，确保代码的一致性和可维护性。

## 命名规范

### 1. 基础常量 (SCREAMING_SNAKE_CASE)

用于定义不会改变的基础常量值，如配置值、魔法数字、枚举值等。

```typescript
// ✅ 正确
export const MAX_RETRY_ATTEMPTS = 3;
export const DEFAULT_TIMEOUT_MS = 5000;
export const API_BASE_URL = "https://api.raypx.com";
export const CACHE_TTL_SECONDS = 3600;

// ❌ 错误
export const maxRetryAttempts = 3;
export const defaultTimeout = 5000;
```

### 2. 环境变量相关常量 (SCREAMING_SNAKE_CASE)

所有与环境变量相关的常量都应使用 SCREAMING_SNAKE_CASE，并在注释中说明对应的环境变量。

```typescript
// ✅ 正确
export const DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/raypx";
export const REDIS_HOST = process.env.REDIS_HOST || "localhost";
export const JWT_SECRET = process.env.JWT_SECRET;

// ❌ 错误
export const databaseUrl = process.env.DATABASE_URL;
export const redisHost = process.env.REDIS_HOST;
```

### 3. 对象常量 (PascalCase + as const)

用于定义包含多个相关常量的对象，使用 PascalCase 命名，并添加 `as const` 断言。

```typescript
// ✅ 正确
export const EmailStatus = {
  QUEUED: "queued",
  SENT: "sent",
  DELIVERED: "delivered",
  BOUNCED: "bounced",
} as const;

export const HttpStatus = {
  OK: 200,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// ❌ 错误
export const emailStatus = {
  queued: "queued",
  sent: "sent",
};
```

### 4. 数组常量 (SCREAMING_SNAKE_CASE)

用于定义常量数组，通常从对象常量派生。

```typescript
// ✅ 正确
export const EMAIL_STATUSES = Object.values(EmailStatus);
export const SUPPORTED_LANGUAGES = ["en", "zh", "ja"] as const;

// ❌ 错误
export const emailStatuses = Object.values(EmailStatus);
```

### 5. 类型常量 (PascalCase)

用于定义类型相关的常量，通常与对象常量配合使用。

```typescript
// ✅ 正确
export type EmailStatus = (typeof EmailStatus)[keyof typeof EmailStatus];
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// ❌ 错误
export type emailStatus = string;
```

## 文件组织规范

### 1. 常量文件命名

- 使用 `constants.ts` 或 `consts.ts` 作为文件名
- 如果常量较多，可以按功能模块拆分，如 `email-constants.ts`

### 2. 文件结构

```typescript
// 1. 导入语句
import { z } from "zod";

// 2. 类型定义
export type EmailStatus = "queued" | "sent" | "delivered" | "bounced";

// 3. 基础常量
export const MAX_EMAIL_LENGTH = 254;
export const DEFAULT_RETRY_COUNT = 3;

// 4. 环境变量常量
export const EMAIL_API_KEY = process.env.EMAIL_API_KEY;

// 5. 对象常量
export const EmailStatus = {
  QUEUED: "queued",
  SENT: "sent",
  DELIVERED: "delivered",
  BOUNCED: "bounced",
} as const;

// 6. 数组常量
export const EMAIL_STATUSES = Object.values(EmailStatus);

// 7. 导出类型
export type EmailStatusValue = (typeof EmailStatus)[keyof typeof EmailStatus];
```

## 注释规范

### 1. 常量注释

每个常量都应该有清晰的注释说明其用途和含义。

```typescript
// ✅ 正确
/** 邮件发送的最大重试次数 */
export const MAX_EMAIL_RETRY_COUNT = 3;

/** 默认的缓存过期时间（秒） */
export const DEFAULT_CACHE_TTL_SECONDS = 3600;

/** 支持的邮件状态列表 */
export const EMAIL_STATUSES = Object.values(EmailStatus);

// ❌ 错误
export const MAX_EMAIL_RETRY_COUNT = 3; // 没有注释
export const DEFAULT_CACHE_TTL_SECONDS = 3600; // 注释不够清晰
```

### 2. 分组注释

使用分组注释来组织相关的常量。

```typescript
// ==================== 邮件配置 ====================
export const EMAIL_API_KEY = process.env.EMAIL_API_KEY;
export const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS;

// ==================== 缓存配置 ====================
export const CACHE_TTL_SECONDS = 3600;
export const CACHE_MAX_SIZE = 1000;

// ==================== 邮件状态 ====================
export const EmailStatus = {
  QUEUED: "queued",
  SENT: "sent",
  DELIVERED: "delivered",
  BOUNCED: "bounced",
} as const;
```

## 类型安全

### 1. 使用 as const 断言

对于对象常量，始终使用 `as const` 断言以确保类型安全。

```typescript
// ✅ 正确 - 类型安全
export const EmailStatus = {
  QUEUED: "queued",
  SENT: "sent",
} as const;

// 类型为: { readonly QUEUED: "queued"; readonly SENT: "sent"; }

// ❌ 错误 - 类型不安全
export const EmailStatus = {
  QUEUED: "queued",
  SENT: "sent",
};

// 类型为: { QUEUED: string; SENT: string; }
```

### 2. 使用 satisfies 进行类型检查

对于复杂的常量定义，使用 `satisfies` 进行类型检查。

```typescript
// ✅ 正确
export const AVAILABLE_LANGUAGES = [
  { key: "en", dir: "ltr" },
  { key: "zh", dir: "ltr" },
] as const satisfies readonly Language[];
```

## 最佳实践

### 1. 避免魔法数字

不要使用魔法数字，应该定义为有意义的常量。

```typescript
// ✅ 正确
export const MAX_RETRY_ATTEMPTS = 3;
export const TIMEOUT_MS = 5000;

if (retryCount < MAX_RETRY_ATTEMPTS) {
  setTimeout(retry, TIMEOUT_MS);
}

// ❌ 错误
if (retryCount < 3) {
  setTimeout(retry, 5000);
}
```

### 2. 使用枚举替代字符串常量

对于有限的选项集合，优先使用枚举而不是字符串常量。

```typescript
// ✅ 正确
export const UserRole = {
  ADMIN: "admin",
  USER: "user",
  GUEST: "guest",
} as const;

// ❌ 错误
export const ADMIN_ROLE = "admin";
export const USER_ROLE = "user";
export const GUEST_ROLE = "guest";
```

### 3. 导出类型

为对象常量导出对应的类型定义。

```typescript
// ✅ 正确
export const EmailStatus = {
  QUEUED: "queued",
  SENT: "sent",
} as const;

export type EmailStatus = (typeof EmailStatus)[keyof typeof EmailStatus];
```

### 4. 避免重复定义

不要在多个文件中重复定义相同的常量，应该集中管理。

```typescript
// ✅ 正确 - 在 packages/shared/src/constants.ts 中定义
export const API_BASE_URL = "https://api.raypx.com";

// 在其他文件中导入使用
import { API_BASE_URL } from "@raypx/shared/constants";

// ❌ 错误 - 在多个文件中重复定义
// file1.ts
export const API_BASE_URL = "https://api.raypx.com";
// file2.ts
export const API_BASE_URL = "https://api.raypx.com";
```

## 示例文件

参考 `packages/redis/src/consts.ts` 和 `packages/email/src/types.ts` 中的实现作为标准示例。

## 检查清单

在定义常量时，请确保：

- [ ] 使用了正确的命名规范
- [ ] 添加了清晰的注释
- [ ] 使用了 `as const` 断言（对于对象常量）
- [ ] 导出了对应的类型定义
- [ ] 避免了魔法数字
- [ ] 遵循了文件组织规范
- [ ] 没有重复定义

## 工具支持

项目使用 Biome 进行代码格式化，确保常量定义符合规范。在提交代码前，请运行：

```bash
pnpm check
pnpm format
```

这将自动检查并修复常量定义的格式问题。
