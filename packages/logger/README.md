# @raypx/logger

Modern structured logging with **evlog** (UnJS ecosystem)

## Features

- ✅ Clean, modern API
- ✅ Structured logging
- ✅ Multiple log levels (trace, debug, info, warn, error, fatal)
- ✅ Context support
- ✅ TypeScript types
- ✅ Zero dependencies
- ✅ UnJS ecosystem integration

## Installation

```bash
bun add evlog
```

## Usage

### Quick Start

```typescript
import { logger } from '@raypx/logger';

// Simple logging
logger.info('Application started');
logger.warn('Warning message');
logger.error('Error occurred');

// With context
logger.info('User logged in', { userId: 123, email: 'user@example.com' });
logger.error('Database error', { error: err, query: 'SELECT * FROM users' });
```

### Custom Logger

```typescript
import { createLogger } from '@raypx/logger';

const apiLogger = createLogger({
  name: 'api',
  level: 'debug',
});

apiLogger.debug('Debug message');
apiLogger.info('Request received', { path: '/api/users', method: 'GET' });
```

### Log Levels

```typescript
logger.trace('Trace level');   // Most verbose
logger.debug('Debug level');
logger.info('Info level');      // Default
logger.warn('Warning level');
logger.error('Error level');
logger.fatal('Fatal level');    // Most severe
```

### Structured Context

```typescript
// Add context to logs
logger.info('User action', {
  userId: 123,
  action: 'create_post',
  timestamp: Date.now(),
  metadata: {
    postId: 456,
    title: 'My Post',
  },
});
```

## API Reference

### `createLogger(options)`

Create a new logger instance.

**Options:**
- `name?: string` - Logger name (appears in logs)
- `level?: string` - Minimum log level ('trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal')

**Returns:** Logger instance

### `logger`

Default logger instance with name 'raypx'.

## Examples

### API Request Logging

```typescript
import { createLogger } from '@raypx/logger';

const apiLogger = createLogger({ name: 'api' });

export async function handler(request: Request) {
  const start = Date.now();
  
  apiLogger.info('Request received', {
    method: request.method,
    url: request.url,
  });
  
  try {
    const result = await processRequest(request);
    
    apiLogger.info('Request completed', {
      method: request.method,
      url: request.url,
      duration: Date.now() - start,
      status: 200,
    });
    
    return result;
  } catch (error) {
    apiLogger.error('Request failed', {
      method: request.method,
      url: request.url,
      duration: Date.now() - start,
      error: error.message,
    });
    
    throw error;
  }
}
```

### Database Query Logging

```typescript
import { createLogger } from '@raypx/logger';
import { getDatabase } from '@raypx/db';

const dbLogger = createLogger({ name: 'database' });

export async function getUsers() {
  dbLogger.debug('Fetching users');
  
  const db = getDatabase();
  const users = await db.select().from(usersTable);
  
  dbLogger.info('Users fetched', { count: users.length });
  
  return users;
}
```

### Error Logging

```typescript
import { logger } from '@raypx/logger';

try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', {
    error: error.message,
    stack: error.stack,
    context: {
      userId: currentUser.id,
      timestamp: Date.now(),
    },
  });
  
  throw error;
}
```

## Environment Configuration

```typescript
// packages/logger/src/index.ts
const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = createLogger({
  name: 'raypx',
  level: isDevelopment ? 'debug' : 'info',
});
```

## Integration with Other Packages

### With @raypx/db

```typescript
import { getDatabase } from '@raypx/db';
import { createLogger } from '@raypx/logger';

const dbLogger = createLogger({ name: 'db' });

export function getDatabaseWithLogging() {
  dbLogger.debug('Database connection requested');
  return getDatabase();
}
```

### With @raypx/auth

```typescript
import { auth } from '@raypx/auth';
import { createLogger } from '@raypx/logger';

const authLogger = createLogger({ name: 'auth' });

export async function signIn(email: string, password: string) {
  authLogger.info('Sign in attempt', { email });
  
  try {
    const result = await auth.signIn(email, password);
    authLogger.info('Sign in successful', { email, userId: result.user.id });
    return result;
  } catch (error) {
    authLogger.error('Sign in failed', { email, error: error.message });
    throw error;
  }
}
```

## Why evlog?

- **Modern**: Built for modern JavaScript/TypeScript projects
- **Simple**: Clean API, easy to use
- **Fast**: Minimal overhead
- **UnJS**: Part of the UnJS ecosystem (citty, consola, ofetch, etc.)
- **Type-safe**: Full TypeScript support

## Comparison with Pino

| Feature | evlog | pino |
|---------|-------|------|
| **API Style** | Modern, clean | Traditional |
| **Setup** | Zero config | Needs transport setup |
| **Size** | Tiny | Larger |
| **Performance** | Fast | Fastest |
| **Ecosystem** | UnJS | Node.js |
| **Maturity** | Newer | Battle-tested |

---

**Clean, modern logging for your application** 🪵
