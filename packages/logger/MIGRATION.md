# Logger Package Migration

## Changes

✅ **Migrated from Pino to Evlog**

### Why Evlog?

- **Modern API** - Cleaner, simpler interface
- **UnJS Ecosystem** - Integrates with citty, consola, ofetch
- **Zero Config** - Works out of the box
- **TypeScript First** - Built with TypeScript
- **Lightweight** - Minimal dependencies

### API Comparison

**Before (Pino):**
```typescript
import pino from 'pino';

const logger = pino({
  name: 'app',
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});
```

**After (Evlog):**
```typescript
import { createLogger } from 'evlog';

const logger = createLogger({
  name: 'app',
  level: 'info',
});
```

### Usage Remains Simple

```typescript
import { logger } from '@raypx/logger';

// No changes needed in your code
logger.info('Message');
logger.error('Error', { context });
```

### Benefits

1. **Simpler setup** - No transport configuration needed
2. **Smaller bundle** - Fewer dependencies
3. **Modern API** - Cleaner TypeScript types
4. **UnJS integration** - Works well with other UnJS tools

---

Migration complete! Your logging code should work without changes.
