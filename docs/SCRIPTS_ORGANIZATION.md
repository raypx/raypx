# Scripts Organization Strategy

## Current State

All scripts are in root `package.json`:
```json
{
  "scripts": {
    "dev": "raypx dev",
    "build": "raypx build",
    "test": "raypx test",
    // ... etc
  }
}
```

## Question: Should We Create a Scripts Package?

### Option 1: Keep in Root (Current) ✅

**Structure:**
```
raypx/
├── package.json          # All scripts here
└── packages/
    └── config/
        └── src/
            └── cli.ts    # raypx CLI
```

**Pros:**
- ✅ **Simple** - One place to look
- ✅ **Standard** - Common monorepo pattern
- ✅ **Easy to find** - Developers expect scripts in root
- ✅ **Less abstraction** - Direct commands

**Cons:**
- ⚠️ Scripts can get long/complex
- ⚠️ Hard to share script logic between packages

---

### Option 2: Create Scripts Package

**Structure:**
```
raypx/
├── package.json          # Minimal, delegates to scripts
└── packages/
    ├── config/           # Build config
    └── scripts/          # Development scripts
        ├── src/
        │   ├── setup.ts
        │   ├── build-all.ts
        │   ├── test-all.ts
        │   ├── deploy.ts
        │   └── migrate.ts
        └── package.json
```

**Root package.json:**
```json
{
  "scripts": {
    "setup": "bun packages/scripts/src/setup.ts",
    "dev": "bun packages/scripts/src/dev.ts",
    "build": "bun packages/scripts/src/build-all.ts"
  }
}
```

**Pros:**
- ✅ **Complex logic** - Full TypeScript power
- ✅ **Reusable** - Share utilities across scripts
- ✅ **Testable** - Can test script logic
- ✅ **Maintainable** - Easier to refactor complex scripts

**Cons:**
- ❌ **More complex** - Extra layer of indirection
- ❌ **Harder to discover** - Not in standard location
- ❌ **Overkill** - For simple commands

---

### Option 3: Hybrid Approach (Recommended) ⭐

**Structure:**
```
raypx/
├── package.json          # Simple scripts
├── scripts/              # Complex scripts (not a package)
│   ├── setup.ts
│   ├── generate-docs.ts
│   └── release.ts
└── packages/
    └── config/
        └── src/
            └── cli.ts    # raypx CLI for common tasks
```

**Root package.json:**
```json
{
  "scripts": {
    // Simple - Use raypx CLI
    "dev": "raypx dev",
    "build": "raypx build",
    "test": "raypx test",
    
    // Complex - Use scripts/
    "setup": "bun scripts/setup.ts",
    "docs:generate": "bun scripts/generate-docs.ts",
    "release": "bun scripts/release.ts"
  }
}
```

**When to use each:**

| Type | Location | Example |
|------|----------|---------|
| **Simple commands** | Root scripts | `dev`, `build`, `test` |
| **CLI commands** | `raypx` CLI | Common dev tasks |
| **Complex scripts** | `scripts/` dir | Setup, release, codegen |
| **Utilities** | `packages/config` | Shared build logic |

---

## Analysis for Raypx

### Current Scripts (Simple) ✅

```json
"dev": "raypx dev",
"build": "raypx build",
"start": "raypx start",
"lint": "raypx lint",
"test": "raypx test"
```

**These are fine in root** - They're simple one-liners

### Potential Complex Scripts

You might need `scripts/` for:

1. **Interactive Setup**
   ```typescript
   // scripts/setup.ts
   import { select, text } from '@clack/prompts';
   
   const dbChoice = await select({
     message: 'Choose database',
     options: [
       { value: 'sqlite', label: 'SQLite (default)' },
       { value: 'postgres', label: 'PostgreSQL' },
     ],
   });
   
   const projectName = await text({
     message: 'Project name?',
     placeholder: 'my-app',
   });
   
   // Generate config, update files, etc.
   ```

2. **Code Generation**
   ```typescript
   // scripts/generate.ts
   import { generateComponent } from './generators/component';
   
   const name = process.argv[2];
   generateComponent(name);
   ```

3. **Release Automation**
   ```typescript
   // scripts/release.ts
   import { exec } from 'node:child_process';
   
   // Bump versions
   // Run tests
   // Build packages
   // Create git tags
   // Publish to npm
   ```

4. **Database Migrations**
   ```typescript
   // scripts/migrate.ts
   import { getDatabase } from '@raypx/db';
   import { migrate } from 'drizzle-orm';
   
   // Run migrations with confirmation
   ```

---

## Recommendation for Raypx

### Use Hybrid Approach ⭐

**Keep simple scripts in root:**
```json
{
  "scripts": {
    "dev": "raypx dev",
    "build": "raypx build",
    "test": "raypx test",
    "lint": "raypx lint"
  }
}
```

**Create `scripts/` directory for complex tasks:**
```
scripts/
├── setup.ts              # Interactive project setup
├── generate.ts           # Code generation
├── release.ts            # Release automation
└── utils/               # Shared script utilities
    ├── prompts.ts
    ├── files.ts
    └── git.ts
```

**Usage:**
```json
{
  "scripts": {
    // Simple (keep in root)
    "dev": "raypx dev",
    "build": "raypx build",
    
    // Complex (use scripts/)
    "setup": "bun scripts/setup.ts",
    "generate": "bun scripts/generate.ts",
    "release": "bun scripts/release.ts"
  }
}
```

---

## Implementation Guide

### Step 1: Create scripts/ Directory

```bash
mkdir -p scripts/utils
```

### Step 2: Add Interactive Setup

```typescript
// scripts/setup.ts
import { intro, outro, text, select, spinner } from '@clack/prompts';
import { writeFileSync } from 'node:fs';

async function setup() {
  intro('Raypx Setup');
  
  const projectName = await text({
    message: 'Project name?',
    placeholder: 'my-app',
    validate: (value) => {
      if (!value) return 'Required';
    },
  });
  
  const database = await select({
    message: 'Choose database',
    options: [
      { value: 'sqlite', label: 'SQLite (simple)' },
      { value: 'postgres', label: 'PostgreSQL (production)' },
    ],
  });
  
  const s = spinner();
  s.start('Setting up project...');
  
  // Generate .env
  const env = `
DATABASE_PATH=./data/${projectName}.db
SESSION_SECRET=${crypto.randomUUID()}
PORT=3000
`;
  writeFileSync('.env', env);
  
  // Install dependencies
  await execa('bun', ['install']);
  
  s.stop('Setup complete!');
  outro('Ready to go! Run: bun run dev');
}

setup();
```

### Step 3: Add Code Generator

```typescript
// scripts/generate.ts
import { intro, outro, text, select } from '@clack/prompts';
import { generateComponent } from './generators/component';
import { generateAPI } from './generators/api';

async function generate() {
  intro('Code Generator');
  
  const type = await select({
    message: 'What to generate?',
    options: [
      { value: 'component', label: 'React Component' },
      { value: 'api', label: 'API Route' },
      { value: 'hook', label: 'React Hook' },
    ],
  });
  
  const name = await text({
    message: 'Name?',
    placeholder: 'MyComponent',
  });
  
  switch (type) {
    case 'component':
      generateComponent(name);
      break;
    case 'api':
      generateAPI(name);
      break;
    // ...
  }
  
  outro('Generated successfully!');
}

generate();
```

---

## Decision Matrix

| Script Complexity | Location | Example |
|-------------------|----------|---------|
| **One-liner** | Root `scripts` | `"dev": "raypx dev"` |
| **2-3 commands** | Root `scripts` | `"check": "bun run build && bun run test"` |
| **Logic/Prompts** | `scripts/*.ts` | Interactive setup |
| **Shared utility** | `packages/config` | Build helpers |

---

## Conclusion

### For Raypx: Use Hybrid ⭐

1. **Keep current simple scripts** in root package.json
2. **Create `scripts/` directory** for:
   - Interactive setup (`setup.ts`)
   - Code generation (`generate.ts`)
   - Release automation (`release.ts`)
3. **Don't create** a `packages/scripts` package (overkill)

**Why:**
- Simple scripts stay simple
- Complex scripts get proper tooling
- No unnecessary package overhead
- Standard pattern (scripts/ is common)

**Action:**
- ✅ Keep current root scripts
- ✅ Create `scripts/` when you need complex logic
- ❌ Don't create `packages/scripts` package

---

**Keep it simple until complexity demands otherwise** 🎯
