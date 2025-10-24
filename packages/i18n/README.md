# @raypx/i18n

Raypx 项目的国际化 (i18n) 包，基于 Inlang Paraglide 构建。

## 功能特性

- 🌍 支持多语言环境（英语、中文）
- 🔄 自动语言环境检测和重定向
- 🛠️ 完整的 TypeScript 类型支持
- 🚀 服务器端中间件支持
- 📱 客户端友好的 API
- 🎯 URL 本地化支持

## 安装

```bash
pnpm add @raypx/i18n
```

## 使用方法

### 服务器端中间件

```typescript
import { paraglideMiddleware } from '@raypx/i18n';

// 在 SvelteKit 中使用
export const handle = async ({ event, resolve }) => {
  return paraglideMiddleware(event.request, ({ request, locale }) => {
    // 让框架进一步解析请求
    return resolve(request);
  });
};

// 在 Express.js 中使用
app.use(async (req, res, next) => {
  const result = await paraglideMiddleware(req, ({ request, locale }) => {
    // 如果发生重定向，这里不会被调用
    return next(request);
  });
});
```

### 语言环境管理

```typescript
import { 
  getLocale, 
  setLocale, 
  isLocale, 
  assertIsLocale,
  type Locale 
} from '@raypx/i18n';

// 获取当前语言环境
const currentLocale: Locale = getLocale();

// 设置语言环境
setLocale('zh', { reload: false });

// 检查是否为有效语言环境
if (isLocale(userInput)) {
  setLocale(userInput);
}

// 断言语言环境有效性
const validLocale: Locale = assertIsLocale(userInput);
```

### URL 本地化

```typescript
import { 
  localizeUrl, 
  deLocalizeUrl, 
  localizeHref, 
  deLocalizeHref 
} from '@raypx/i18n';

// 服务器端 URL 本地化
const localizedUrl = localizeUrl('https://example.com/about', { locale: 'zh' });
// => URL('https://example.com/zh/about')

// 客户端友好的 href 本地化
const localizedHref = localizeHref('/about', { locale: 'zh' });
// => '/zh/about'

// 去本地化
const baseUrl = deLocalizeUrl('https://example.com/zh/about');
// => URL('https://example.com/about')
```

### 重定向检查

```typescript
import { shouldRedirect } from '@raypx/i18n';

// 检查是否需要重定向
const decision = await shouldRedirect({ request });
if (decision.shouldRedirect) {
  return Response.redirect(decision.redirectUrl, 307);
}
```

### 自定义策略

```typescript
import { 
  defineCustomServerStrategy, 
  defineCustomClientStrategy,
  type CustomServerStrategyHandler,
  type CustomClientStrategyHandler 
} from '@raypx/i18n';

// 定义自定义服务器策略
const serverHandler: CustomServerStrategyHandler = {
  getLocale: (request) => {
    // 从请求头中提取语言环境
    return request?.headers.get('x-locale') || undefined;
  }
};

defineCustomServerStrategy('custom-header', serverHandler);

// 定义自定义客户端策略
const clientHandler: CustomClientStrategyHandler = {
  getLocale: () => {
    // 从 localStorage 获取语言环境
    return localStorage.getItem('user-locale') || undefined;
  },
  setLocale: (locale) => {
    localStorage.setItem('user-locale', locale);
  }
};

defineCustomClientStrategy('custom-storage', clientHandler);
```

## 类型定义

### 核心类型

```typescript
// 语言环境类型
type Locale = 'en' | 'zh';
type BaseLocale = 'en';
type Locales = readonly ['en', 'zh'];

// 策略类型
type BuiltInStrategy = 'cookie' | 'baseLocale' | 'globalVariable' | 'url' | 'preferredLanguage' | 'localStorage';
type CustomStrategy = `custom-${string}`;
type Strategy = BuiltInStrategy | CustomStrategy;
```

### 中间件类型

```typescript
// 服务器中间件函数
type ParaglideMiddleware = <T = any>(
  request: Request,
  resolve: ServerMiddlewareResolve<T>,
  callbacks?: ServerMiddlewareCallbacks
) => Promise<Response>;

// 解析函数
type ServerMiddlewareResolve<T = any> = (args: {
  request: Request;
  locale: Locale;
}) => T | Promise<T>;

// 回调函数
interface ServerMiddlewareCallbacks {
  onRedirect?: (response: Response) => void;
}
```

### 重定向类型

```typescript
// 重定向输入
interface ShouldRedirectServerInput {
  request: Request;
  url?: string | URL;
  locale?: Locale;
}

interface ShouldRedirectClientInput {
  request?: undefined;
  url?: string | URL;
  locale?: Locale;
}

// 重定向结果
interface ShouldRedirectResult {
  shouldRedirect: boolean;
  locale: Locale;
  redirectUrl: URL | undefined;
}
```

## 配置

### 语言环境配置

当前支持的语言环境：
- `en` - 英语（基础语言环境）
- `zh` - 中文

### URL 模式

默认 URL 模式：
- `/` → `/en/` 或 `/zh/`
- `/:path(.*)?` → `/en/:path(.*)?` 或 `/zh/:path(.*)?`

### 策略配置

默认策略顺序：
1. `url` - 从 URL 路径提取语言环境
2. `cookie` - 从 cookie 提取语言环境
3. `preferredLanguage` - 从 Accept-Language 头提取语言环境
4. `baseLocale` - 回退到基础语言环境

## 开发

### 构建

```bash
pnpm build
```

### 类型检查

```bash
pnpm typecheck
```

### 代码格式化

```bash
pnpm format
```

## 许可证

MIT
