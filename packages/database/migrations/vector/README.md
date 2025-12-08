# Vector Database Migrations

This directory contains migration files for the vector database.

## Important: pgvector Extension

**Before running migrations, ensure the pgvector extension is installed:**

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This extension is required for the `vector` data type used in `vector_embeddings` table.

## Setup

### Scenario 1: Separate Vector Database (Recommended)

Set `VECTOR_URL` environment variable:

```bash
# .env
DATABASE_URL=postgresql://user:password@host:5432/raypx
VECTOR_URL=postgresql://user:password@host:5432/raypx_vector
```

### Scenario 2: Same Database as Main

Don't set `VECTOR_URL`, it will automatically use `DATABASE_URL`:

```bash
# .env
DATABASE_URL=postgresql://user:password@host:5432/raypx
# VECTOR_URL is not set, will use DATABASE_URL
```

## Initial Setup Steps

1. **Install pgvector extension** (if not already installed):

```sql
-- Connect to your database
-- For separate vector database:
\c raypx_vector

-- For same database:
\c raypx

-- Create extension
CREATE EXTENSION IF NOT EXISTS vector;
```

2. **Generate migration files**:

```bash
pnpm db generate vector
```

3. **Add extension creation to first migration** (if not auto-generated):

Edit the first migration file (`0000_*.sql`) and add at the top:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

4. **Review generated SQL**:

```bash
cat packages/database/drizzle-vector/0000_*.sql
```

5. **Apply migration**:

```bash
# Development (direct push, no migration files)
pnpm db push vector

# Production (execute migration files)
pnpm db migrate vector
```

## Commands

### Generate Migration Files

```bash
# Generate migration files (does not execute)
pnpm db generate vector
```

### Push Schema (Development)

```bash
# Directly push schema to database (no migration files)
pnpm db push vector
```

### Run Migrations (Production)

```bash
# Execute migration files
pnpm db migrate vector
```

### Open Drizzle Studio

```bash
# Open Drizzle Studio for vector database
pnpm db studio vector
```

## Migration Files

Migration files are stored in `packages/database/drizzle-vector/`:

- `0000_*.sql` - Migration SQL files
- `meta/_journal.json` - Migration history
- `meta/0000_snapshot.json` - Schema snapshots

## Notes

- Vector tables use `vector_` prefix to avoid conflicts with main database tables
- If using same database, tables will coexist with main database tables
- Vector similarity indexes (HNSW) need to be created manually via SQL migration
- **pgvector extension must be installed before creating tables with vector columns**
