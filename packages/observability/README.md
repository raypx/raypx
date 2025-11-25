# @raypx/observability

System monitoring and error tracking toolkit with Sentry integration.

## 🚀 Integrated Tools

| Tool | Purpose | Status |
|------|---------|--------|
| **Sentry** | Error monitoring, performance tracking, session replay | ✅ Enabled |

## 📦 Installation

```bash
pnpm add @raypx/observability
```

## 🔧 Configuration

### Environment Variables

Configure in your `.env` file:

```bash
# ===== Sentry Error Monitoring =====
VITE_SENTRY_DSN=https://your-sentry-dsn.ingest.sentry.io/xxxxx
VITE_SENTRY_ENABLE_DEV=false  # Enable Sentry in development
```

## 📖 Usage

### Client-side initialization

```typescript
import { initSentryClient } from "@raypx/observability/sentry/client";

// Initialize at app entry point
const router = createRouter();
initSentryClient({ router });
```

### Server-side initialization

```typescript
import { initSentryServer } from "@raypx/observability/sentry/server";

// Initialize when server starts
initSentryServer();
```

### Manual error capture

```typescript
import { captureException } from "@raypx/observability";

try {
  // Your code
} catch (error) {
  captureException(error);
}
```

## 🔗 Related Links

- [Sentry Documentation](https://docs.sentry.io/)

## 📝 License

MIT

