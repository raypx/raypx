# Architecture Guide

## Overview

Raypx is a modern, type-safe monorepo for building full-stack applications with:
- **TanStack Start** - Full-stack React framework
- **Drizzle ORM** - Type-safe SQL with SQLite
- **Better Auth** - Complete authentication system
- **Bun** - Fast JavaScript runtime
- **TypeScript** - End-to-end type safety

## Package Structure

### Infrastructure Layer

**@raypx/db** - Database layer
- SQLite with Drizzle ORM
- Type-safe queries
- Migration management
- Transaction support

**@raypx/logger** - Logging system
- Structured logging with Pino
- Development/production modes
- Context-aware logging

**@raypx/config** - Engineering tools
- Build configuration
- TypeScript presets
- Development utilities

### Application Layer

**@raypx/auth** - Authentication
- Email/password authentication
- Session management
- Protected route middleware
- Better Auth integration

**@raypx/api** - API implementation
- Server-side business logic
- Database access
- Authentication integration

### Presentation Layer

**@raypx/contracts** - Shared schemas
- Zod validation schemas
- Type definitions
- API contracts

**@raypx/api-client** - HTTP client
- Type-safe API calls
- Error handling
- Request utilities

**@raypx/hooks** - React hooks
- State management
- API integration
- Reusable logic

**@raypx/ui** - UI components
- Reusable components
- Styling utilities

## Dependency Rules

```
┌─────────────────────────────────────┐
│         Presentation Layer          │
│  api-client, hooks, ui, contracts   │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│        Application Layer            │
│         api, auth                   │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│      Infrastructure Layer           │
│      db, logger, config             │
└─────────────────────────────────────┘
```

### Rules
- ✅ Lower layers can be used by upper layers
- ❌ Upper layers cannot be imported by lower layers
- ✅ Presentation layer packages are browser-safe
- ❌ Application/Infrastructure layers are server-only

## Project Layout

```
raypx/
├── apps/
│   └── web/              # TanStack Start application
│       ├── src/
│       │   ├── routes/   # File-based routing
│       │   ├── server/   # Server-only code
│       │   └── components/
│       └── package.json
├── packages/
│   ├── db/               # Database layer
│   ├── auth/             # Authentication
│   ├── logger/           # Logging
│   ├── api/              # Server API
│   ├── api-client/       # HTTP client
│   ├── contracts/        # Schemas
│   ├── hooks/            # React hooks
│   ├── ui/               # UI components
│   └── config/           # Engineering
└── package.json          # Workspace root
```

## Development Workflow

### 1. Database Schema

```typescript
// packages/db/src/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
});
```

### 2. Generate Migration

```bash
cd packages/db
bun drizzle-kit generate
bun drizzle-kit migrate
```

### 3. API Implementation

```typescript
// apps/web/src/routes/api.users.ts
import { createFileRoute } from '@tanstack/react-router';
import { getDatabase } from '@raypx/db';
import { users } from '@raypx/db/schema';

export const Route = createFileRoute('/api/users')({
  server: {
    handlers: {
      async GET() {
        const db = getDatabase();
        const allUsers = await db.select().from(users);
        return Response.json(allUsers);
      },
    },
  },
});
```

### 4. Client Integration

```typescript
// Use in React components
import { useHealthCheck } from '@raypx/hooks';

function App() {
  const { status, loading } = useHealthCheck();
  
  if (loading) return <div>Loading...</div>;
  return <div>Status: {status}</div>;
}
```

## Key Principles

### Type Safety
- End-to-end TypeScript
- Zod runtime validation
- Drizzle type-safe queries
- Better Auth typed sessions

### Separation of Concerns
- Clear layer boundaries
- Single responsibility packages
- Explicit dependencies

### Developer Experience
- Fast builds with Bun
- Type-safe APIs
- Hot reload
- Comprehensive logging

### Production Ready
- SQLite for simplicity (migrate to PostgreSQL when needed)
- Session-based authentication
- Structured logging
- Error handling

## Migration Path

### From Development to Production

1. **Database**: SQLite → PostgreSQL
   ```typescript
   // Switch Drizzle adapter
   import { drizzle } from 'drizzle-orm/postgres-js';
   ```

2. **Authentication**: Add OAuth providers
   ```typescript
   // Enable in Better Auth config
   oauth: {
     google: { ... },
     github: { ... },
   }
   ```

3. **Deployment**: Bun/Node runtime
   ```bash
   bun run build
   bun run start
   ```

## Best Practices

### Database
- Use transactions for multi-step operations
- Index frequently queried columns
- Keep migrations small and focused

### Authentication
- Enable email verification in production
- Use strong password requirements
- Implement rate limiting

### API Design
- Use Zod for request validation
- Return consistent error formats
- Log all errors with context

### Testing
- Unit test business logic
- Integration test APIs
- E2E test critical flows

---

For detailed package documentation, see individual package README files.
