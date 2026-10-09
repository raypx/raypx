# Vite vs Vitest Config: Should We Split?

## Current Approach: Unified Config

```typescript
// packages/storage/vite.config.ts
import { defineConfig } from "vite-plus";
import { packageConfig } from "@raypx/config/vite";

export default defineConfig(
  packageConfig(import.meta.url, {
    name: "@raypx/storage",
    test: true, // ← Enables Vitest
  }),
);
```

## Analysis

### Option 1: Keep Unified ✅ (Current)

**Pros:**

- ✅ **Simpler** - One config file per package
- ✅ **DRY** - Shared build and test config
- ✅ **Consistency** - Same pattern across all packages
- ✅ **Less duplication** - packageConfig handles both
- ✅ **Maintenance** - Update one place, affects both

**Cons:**

- ⚠️ **Mixing concerns** - Build + test in same file
- ⚠️ **Harder to customize test-only** settings

**When to use:**

- Simple packages with standard test needs
- Want minimal configuration
- Build and test settings are related

---

### Option 2: Split Config

**Structure:**

```
packages/storage/
├── vite.config.ts       # Build only
└── vitest.config.ts     # Test only
```

**Build config:**

```typescript
// vite.config.ts
import { defineConfig } from "vite-plus";
import { packageConfig } from "@raypx/config/vite";

export default defineConfig(
  packageConfig(import.meta.url, {
    name: "@raypx/storage",
    test: false, // No test in build config
  }),
);
```

**Test config:**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["**/node_modules/**", "**/dist/**"],
    },
    setupFiles: ["./test/setup.ts"],
  },
});
```

**Pros:**

- ✅ **Separation of concerns** - Clear build vs test
- ✅ **Fine-grained control** - Test-specific config easy
- ✅ **Advanced features** - Custom coverage, setup files
- ✅ **Clearer intent** - Each file has one job

**Cons:**

- ❌ **More files** - 2 configs per package
- ❌ **Duplication risk** - May repeat settings
- ❌ **Inconsistency** - Easy for packages to diverge

**When to use:**

- Complex test requirements
- Custom coverage settings
- Test setup files needed
- Different test environments per package

---

## Recommendation for Raypx

### Keep Unified Config ✅

**Rationale:**

1. **Simplicity Wins**
   - Most packages have simple test needs
   - One config = easier to understand
   - New contributors face less complexity

2. **Current Pattern Works**
   - `packageConfig()` already handles both
   - No complaints about limitations
   - Tests run fine

3. **Consistency Matters**
   - Same pattern across all 10 packages
   - Easier to navigate codebase
   - Less mental overhead

4. **Can Always Split Later**
   - If a package needs complex test config, split it
   - Don't prematurely optimize
   - YAGNI principle

### When to Split

Split `vitest.config.ts` for a **specific package** if:

1. **Complex Coverage Rules**

   ```typescript
   coverage: {
     include: ['src/critical/**'],
     exclude: ['src/legacy/**'],
     thresholds: {
       statements: 90,
       branches: 85
     },
   }
   ```

2. **Custom Test Setup**

   ```typescript
   setupFiles: ["./test/setup-db.ts", "./test/setup-mocks.ts"];
   ```

3. **Different Test Environments**

   ```typescript
   // Some tests in node, some in jsdom
   environment: 'jsdom',
   environmentOptions: {
     jsdom: {
       url: 'http://localhost:3000',
     },
   }
   ```

4. **Test-Specific Plugins**
   ```typescript
   plugins: [MockPlugin(), TestUtilsPlugin()];
   ```

---

## Implementation Patterns

### Pattern A: Unified (Current) ⭐

**Best for:** 9 out of 10 packages

```typescript
// vite.config.ts
export default defineConfig(
  packageConfig(import.meta.url, {
    name: "@raypx/storage",
    test: true, // Simple flag
  }),
);
```

**Test runs:** `bun test` or `vitest`

---

### Pattern B: Hybrid (Pragmatic)

**Use unified for most packages, split only when needed**

**Example - Most packages:**

```typescript
// packages/logger/vite.config.ts
export default defineConfig(
  packageConfig(import.meta.url, {
    name: "@raypx/logger",
    test: true,
  }),
);
```

**Example - Complex package (e.g., auth):**

```typescript
// packages/auth/vite.config.ts - Build only
export default defineConfig(
  packageConfig(import.meta.url, {
    name: "@raypx/auth",
    test: false,
  }),
);

// packages/auth/vitest.config.ts - Test only
export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    coverage: {
      thresholds: {
        statements: 90,
        functions: 90,
      },
    },
  },
});
```

---

### Pattern C: Always Split

**Every package has both files**

**Pros:** Maximum flexibility
**Cons:** Over-engineering for simple packages

**Not recommended for Raypx** - Too much overhead

---

## Decision Tree

```
Need custom test config?
├─ No  → Use unified vite.config.ts ✅
└─ Yes → Is it complex?
    ├─ No (1-2 options) → Add to vite.config.ts
    └─ Yes (>2 options, setup files) → Split vitest.config.ts
```

---

## Real Example

### Storage Package (Simple) ✅

**Keep unified:**

```typescript
// vite.config.ts
export default defineConfig(
  packageConfig(import.meta.url, {
    name: "@raypx/storage",
    test: true, // Simple test needs
  }),
);
```

**Why:**

- Standard tests
- No special setup
- No complex coverage rules

### Auth Package (If Complex)

**Could split if needed:**

```typescript
// vite.config.ts
export default defineConfig(
  packageConfig(import.meta.url, {
    name: "@raypx/auth",
    test: false,
  }),
);

// vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: ["./test/setup-db.ts"],
    globalSetup: ["./test/global-setup.ts"],
    coverage: {
      thresholds: { statements: 90 },
    },
    poolOptions: {
      threads: {
        singleThread: true, // DB tests sequential
      },
    },
  },
});
```

**Why:**

- Database setup needed
- Sequential test execution
- High coverage requirements

---

## Conclusion

### For Raypx: Keep Unified ✅

**Current setup is good because:**

1. Keeps things simple
2. Works for 90% of use cases
3. Easy to split later if needed
4. Consistent across packages

**Action:**

- ✅ Keep current unified approach
- ✅ Document when to split (this doc)
- ✅ Split only when complexity justifies it

**Future:**

- If a package grows complex test needs, split it
- Don't prematurely optimize
- Simplicity > Flexibility (for now)

---

**YAGNI: You Aren't Gonna Need It (yet)** 🎯
