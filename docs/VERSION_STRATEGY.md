# Dependency Version Strategy

## Current Approach: Fixed Versions

### Why Fixed Versions?

```json
{
  "catalog": {
    "evlog": "2.30.1",           // Exact version
    "unstorage": "1.14.1",       // Exact version
    "better-auth": "1.6.1"       // Exact version
  }
}
```

### Advantages ✅

1. **Predictable Builds**
   - Same code today = same code tomorrow
   - No surprise breakages from dependency updates
   - CI/CD runs are reproducible

2. **Team Consistency**
   - Everyone on the team uses identical versions
   - "Works on my machine" issues reduced
   - Lock file ensures exact resolution

3. **Security**
   - You control when updates happen
   - Can audit changes before upgrading
   - No automatic breaking changes

4. **Debugging**
   - Easier to trace issues to specific versions
   - Stack traces match published code
   - Community support references same version

### Disadvantages ❌

1. **Manual Updates Required**
   - Need to actively check for updates
   - Security patches require manual intervention
   - Can fall behind quickly

2. **Maintenance Burden**
   - Regular update cycle needed
   - Testing after each update

---

## Alternative: Version Ranges

### Caret Ranges (^)

```json
{
  "catalog": {
    "evlog": "^2.30.1",          // 2.30.1 <= version < 3.0.0
    "unstorage": "^1.14.1"       // 1.14.1 <= version < 2.0.0
  }
}
```

**Allows:**
- ✅ Minor updates (1.14.1 → 1.15.0)
- ✅ Patch updates (1.14.1 → 1.14.2)
- ❌ Major updates (1.x.x → 2.x.x)

**Good for:** Stable, well-maintained packages following semver

### Tilde Ranges (~)

```json
{
  "catalog": {
    "evlog": "~2.30.1",          // 2.30.1 <= version < 2.31.0
    "unstorage": "~1.14.1"       // 1.14.1 <= version < 1.15.0
  }
}
```

**Allows:**
- ✅ Patch updates only (1.14.1 → 1.14.9)
- ❌ Minor updates (1.14.x → 1.15.x)
- ❌ Major updates

**Good for:** Conservative updates, security patches only

### Greater/Less Than

```json
{
  "catalog": {
    "evlog": ">=2.30.1 <3.0.0"   // Explicit range
  }
}
```

**Good for:** Complex compatibility requirements

---

## Recommended Strategy

### For Raypx Template

**Use Fixed Versions Because:**

1. **It's a Template**
   - Users fork and customize
   - They should get a known-working state
   - Prevents "broken on clone" issues

2. **Production-Ready Baseline**
   - All versions tested together
   - Known to work as a unit
   - Users can upgrade on their own schedule

3. **Documentation Accuracy**
   - Docs match exact behavior
   - Examples work as written
   - Reduces support burden

### Implementation

```json
{
  "workspaces": {
    "catalog": {
      // Core framework (fixed for stability)
      "vite": "npm:@voidzero-dev/vite-plus-core@1.1.0",
      "vite-plus": "1.1.0",
      
      // Backend dependencies (fixed)
      "evlog": "2.30.1",
      "better-sqlite3": "11.8.1",
      "drizzle-orm": "0.36.4",
      "better-auth": "1.6.1",
      "unstorage": "1.14.1",
      "ioredis": "5.4.2"
    }
  },
  "devDependencies": {
    // Use taze for manual updates
    "taze": "^0.17.2"
  },
  "scripts": {
    "update": "taze major -r -w",
    "update:minor": "taze minor -r -w",
    "update:patch": "taze patch -r -w"
  }
}
```

---

## Update Strategy

### Manual Updates with Taze

```bash
# Check for updates (don't write)
bunx taze major -r

# Update all to latest
bun run update

# Update minor/patch only (safer)
bun run update:minor
```

### Automated Updates (Optional)

Use Renovate or Dependabot for PRs:

```json
// renovate.json
{
  "extends": ["config:base"],
  "packageRules": [
    {
      "matchManagers": ["bun"],
      "enabled": true
    }
  ],
  "schedule": ["every weekend"],
  "automerge": false
}
```

---

## When to Change Strategy

### Use Ranges If:

1. **Active Development Phase**
   - Rapidly evolving codebase
   - Want latest features immediately
   - Team can handle breaking changes

2. **Single Team Project**
   - Not a template/library
   - Controlled environment
   - Quick feedback on issues

3. **Following Specific Package**
   - Trust package's semver adherence
   - Need automatic security patches
   - Example: `"zod": "^3.0.0"`

### Keep Fixed If:

1. **Public Template** ✅ (Raypx)
   - Users expect stability
   - Reduce support burden
   - Known-working baseline

2. **Production App**
   - Zero tolerance for surprises
   - Controlled update schedule
   - Thorough testing required

3. **Complex Dependencies**
   - Packages with frequent breaking changes
   - Immature ecosystem
   - Need exact compatibility

---

## Comparison Table

| Aspect | Fixed | Caret (^) | Tilde (~) |
|--------|-------|-----------|-----------|
| **Predictability** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Security Patches** | Manual | Auto | Auto |
| **Breaking Changes** | Never | Rare | Never |
| **Maintenance** | Manual | Automated | Automated |
| **Stability** | Highest | Medium | High |
| **Freshness** | Manual | Automatic | Automatic |

---

## Recommendation for Raypx

### Keep Fixed Versions ✅

**Rationale:**
1. It's a **Forge template** - users clone a working baseline
2. Predictability > Freshness for templates
3. Users can upgrade on their own schedule
4. Reduces "doesn't work on my machine" issues
5. Documentation stays accurate

**But Provide Easy Updates:**
```bash
# Users can update when ready
bun run update
```

**Document in README:**
```markdown
## Updating Dependencies

This template uses fixed versions for stability.

To update to latest versions:
```bash
bun run update
```
```

---

## Conclusion

**For Raypx:** Fixed versions are the right choice because:
- ✅ It's a template (not an app)
- ✅ Stability matters more than freshness
- ✅ Users expect it to "just work"
- ✅ Reduce support burden
- ✅ Provide update tools for user control

**Users who want ranges can change them after forking.**

---

**Stability first, updates on demand** 🔒
