# @raypx/database

Database package for Raypx, providing database schemas, connections, and migration management for both main PostgreSQL and vector databases.

## Structure

```
packages/database/
├── config/                    # Drizzle Kit configuration files
│   ├── drizzle.config.ts     # Main database config
│   └── drizzle-vector.config.ts # Vector database config
├── migrations/                # Database migration files
│   ├── pg/                   # Main database migrations
│   └── vector/               # Vector database migrations
├── docs/                      # Documentation
│   ├── DATABASE_MIGRATION_GUIDE.md
│   ├── DB_COMMANDS.md
│   ├── VECTOR_DATABASE_SETUP.md
│   └── ...
├── src/
│   ├── adapters/             # Database adapters (Neon, Postgres)
│   ├── schemas/              # Database schemas
│   │   ├── _table.ts         # Shared table utilities
│   │   ├── pg/               # Main database schemas
│   │   │   ├── auth.ts
│   │   │   ├── billing.ts
│   │   │   ├── configs.ts
│   │   │   └── ...
│   │   └── vector/           # Vector database schemas
│   │       └── vector.ts
│   ├── services/             # Database services
│   ├── envs.ts               # Environment variable definitions
│   ├── index.ts              # Main entry point
│   └── ...
└── seed.ts                   # Database seeding script
```

## Database Types

### Main Database (`pg`)
Stores business data:
- User authentication and authorization
- Organizations and memberships
- Billing and subscriptions
- Documents and datasets
- Conversations and messages
- Configuration settings

### Vector Database (`vector`)
Stores vector embeddings for RAG:
- Vector embeddings with metadata
- Optimized for similarity search using pgvector

## Usage

### Database Connections

```typescript
import { db, vectorDb } from "@raypx/database";

// Main database connection
const user = await db.query.user.findFirst();

// Vector database connection
const embeddings = await vectorDb.query.vectorEmbeddings.findMany();
```

### Schemas

```typescript
// Main database schemas
import { user, documents, datasets } from "@raypx/database/schemas";

// Vector database schemas
import { vectorEmbeddings } from "@raypx/database/vectorSchemas";
```

## Database Management

Use the unified `pnpm db` command:

```bash
# Generate migrations
pnpm db generate main      # Generate main database migrations
pnpm db generate vector    # Generate vector database migrations
pnpm db generate all       # Generate both

# Push schema (development)
pnpm db push main
pnpm db push vector
pnpm db push all

# Execute migrations (production)
pnpm db migrate main
pnpm db migrate vector
pnpm db migrate all

# Open Drizzle Studio
pnpm db studio main
pnpm db studio vector
```

## Configuration

### Environment Variables

- `DATABASE_URL` - Main database connection string (required)
- `VECTOR_URL` - Vector database connection string (optional, falls back to DATABASE_URL)
- `DATABASE_PREFIX` - Table name prefix (optional)

### Separate vs Co-located Databases

**Separate Vector Database** (recommended for production):
```bash
DATABASE_URL=postgresql://user:pass@host:5432/raypx
VECTOR_URL=postgresql://user:pass@host:5432/raypx_vector
```

**Co-located** (development/small scale):
```bash
DATABASE_URL=postgresql://user:pass@host:5432/raypx
# VECTOR_URL not set, uses DATABASE_URL
```

## Migration Workflow

1. **Development**: Use `pnpm db push` to directly sync schema
2. **Production**: Use `pnpm db generate` → review → `pnpm db migrate`

See [docs/DATABASE_MIGRATION_GUIDE.md](./docs/DATABASE_MIGRATION_GUIDE.md) for detailed migration workflow.

## Documentation

- [Database Migration Guide](./docs/DATABASE_MIGRATION_GUIDE.md)
- [DB Commands](./docs/DB_COMMANDS.md)
- [Vector Database Setup](./docs/VECTOR_DATABASE_SETUP.md)
- [Vector Database Usage](./docs/VECTOR_DATABASE_USAGE.md)

