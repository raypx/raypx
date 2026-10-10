# Scripts Package Decision

> Historical decision discussion. Raypx now uses the root `scripts/` directory,
> a Bun entrypoint, and citty command adapters. Follow the
> [engineering scripts guide](../scripts/README.md) for the implemented layout
> and verification commands; the examples below are retained as historical context.

## Current Situation

We have created:

- `scripts/setup.ts` - Interactive project setup
- `scripts/install-hooks.ts` - Pre-commit hooks installation

## Question: Should These Be a Package?

### Option 1: Keep as Scripts Directory ✅ (Recommended)

**Structure:**

```
scripts/
├── setup.ts
├── install-hooks.ts
├── generate.ts (future)
├── release.ts (future)
└── utils/
    ├── prompts.ts
    ├── exec.ts
    └── files.ts
```

**Pros:**

- ✅ **Standard pattern** - `scripts/` is conventional
- ✅ **Simple** - No package overhead
- ✅ **Fast** - Direct execution with `bun scripts/x.ts`
- ✅ **Flexible** - Easy to add/modify scripts
- ✅ **No exports needed** - Scripts are self-contained

**Cons:**

- ⚠️ Harder to share utilities between scripts
- ⚠️ No formal package structure

**When to use:** For Raypx (it's a template, not a library)

---

### Option 2: Create Scripts Package

**Structure:**

```
packages/
└── scripts/
    ├── package.json
    ├── src/
    │   ├── cli.ts
    │   ├── setup.ts
    │   ├── install-hooks.ts
    │   └── utils/
    └── bin/
        └── raypx-scripts
```

**Pros:**

- ✅ **Reusable** - Can publish to npm
- ✅ **Testable** - Can write tests for scripts
- ✅ **Structured** - Clear exports and APIs
- ✅ **Versioned** - Can version scripts independently

**Cons:**

- ❌ **Overkill** - Adds complexity for simple scripts
- ❌ **Build step** - Need to compile TypeScript
- ❌ **Over-engineering** - Template doesn't need this

**When to use:** For published CLI tools or frameworks

---

### Option 3: Hybrid (Smart Choice) ⭐

**Keep scripts in `scripts/` but extract shared utilities:**

```
scripts/
├── setup.ts              # Uses utils
├── install-hooks.ts      # Uses utils
├── generate.ts
└── utils/               # Shared utilities
    ├── prompts.ts       # Reusable prompt helpers
    ├── exec.ts          # Command execution
    ├── files.ts         # File operations
    └── index.ts         # Export all

packages/
└── config/              # Build-time only, not scripts
```

**Example utility:**

```typescript
// scripts/utils/prompts.ts
import { text, select, confirm } from "@clack/prompts";

export async function askProjectName() {
  return await text({
    message: "Project name?",
    placeholder: "my-app",
    validate: (v) => {
      if (!v) return "Required";
      if (!/^[a-z0-9-]+$/.test(v)) return "Use lowercase, numbers, hyphens";
    },
  });
}

export async function askDatabase() {
  return await select({
    message: "Choose database",
    options: [
      { value: "sqlite", label: "SQLite" },
      { value: "postgres", label: "PostgreSQL" },
    ],
  });
}

// scripts/utils/exec.ts
import { execSync } from "node:child_process";
import { spinner } from "@clack/prompts";

export async function runCommand(cmd: string, message: string) {
  const s = spinner();
  s.start(message);

  try {
    execSync(cmd, { stdio: "ignore" });
    s.stop(`${message} ✓`);
    return true;
  } catch (error) {
    s.stop(`${message} ✗`);
    return false;
  }
}
```

**Then scripts become simpler:**

```typescript
// scripts/setup.ts
import { intro, outro } from "@clack/prompts";
import { askProjectName, askDatabase } from "./utils/prompts";
import { runCommand } from "./utils/exec";

async function setup() {
  intro("Setup");

  const name = await askProjectName();
  const db = await askDatabase();

  // Generate .env...

  await runCommand("bun install", "Installing dependencies");

  outro("Done!");
}

setup();
```

---

## Recommendation for Raypx

### Use Hybrid Approach ⭐

**Rationale:**

1. **It's a template** - Users will customize scripts
2. **Simple is better** - No package overhead
3. **Share utilities** - Extract common logic to `scripts/utils/`
4. **Easy to evolve** - Can always package later if needed

**Implementation:**

```bash
scripts/
├── setup.ts              # Main scripts
├── install-hooks.ts
├── generate.ts
├── release.ts
└── utils/               # Shared utilities
    ├── index.ts         # Export all
    ├── prompts.ts       # Prompt helpers
    ├── exec.ts          # Command execution
    ├── files.ts         # File operations
    └── git.ts           # Git operations
```

**Benefits:**

- ✅ Scripts stay simple and readable
- ✅ Shared logic in one place
- ✅ No package overhead
- ✅ Easy for users to customize
- ✅ Standard `scripts/` pattern

---

## When to Create Scripts Package

Create a separate `@raypx/scripts` package **ONLY IF**:

1. **You're building a framework** (not a template)
2. **Scripts need to be published** to npm
3. **Multiple projects will use** the same scripts
4. **Scripts have complex dependencies** requiring versioning

**For Raypx:** None of these apply. It's a template!

---

## Action Plan

### Step 1: Create Utils Directory

```bash
mkdir -p scripts/utils
```

### Step 2: Extract Common Logic

```typescript
// scripts/utils/index.ts
export * from "./prompts";
export * from "./exec";
export * from "./files";
export * from "./git";
```

### Step 3: Refactor Existing Scripts

Update `setup.ts` and `install-hooks.ts` to use utils.

### Step 4: Add More Scripts

```typescript
// scripts/generate.ts - Code generator
// scripts/release.ts - Release automation
// scripts/migrate.ts - Database migrations
```

---

## Comparison

| Aspect           | Scripts Dir       | Scripts Package | Hybrid          |
| ---------------- | ----------------- | --------------- | --------------- |
| **Setup**        | ⭐⭐⭐⭐⭐ Simple | ⭐⭐ Complex    | ⭐⭐⭐⭐ Easy   |
| **Flexibility**  | ⭐⭐⭐⭐⭐ High   | ⭐⭐⭐ Medium   | ⭐⭐⭐⭐⭐ High |
| **Reusability**  | ⭐⭐ Low          | ⭐⭐⭐⭐⭐ High | ⭐⭐⭐⭐ Good   |
| **Maintenance**  | ⭐⭐⭐ Medium     | ⭐⭐ Hard       | ⭐⭐⭐⭐ Easy   |
| **For Template** | ✅ Good           | ❌ Overkill     | ✅ Perfect      |

---

## Conclusion

**For Raypx: Use Hybrid Approach ⭐**

- Keep scripts in `scripts/` directory
- Extract shared utilities to `scripts/utils/`
- Don't create a package (overkill for a template)
- Users can customize easily

**Action:**

1. Create `scripts/utils/` directory
2. Move shared logic to utilities
3. Keep scripts simple and readable

**Don't create a scripts package** - it's not needed for a template project.

---

**Keep it simple, stupid (KISS)** 🎯
