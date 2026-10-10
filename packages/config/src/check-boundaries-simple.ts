import { declaredDependencies, workspacePackages, workspaceRoot } from "./workspace.ts";

/**
 * Minimal boundary checker - only checks what matters
 *
 * What we check:
 * 1. Circular dependencies (breaks builds)
 * 2. Browser importing server packages (security issue)
 * 3. Client and UI business workspace dependency directions
 *
 * What we DON'T check (let TypeScript handle it):
 * - Type safety
 * - Public exports
 * - Import paths
 */

const BROWSER_PACKAGES = ["contracts", "client", "ui"];
const SERVER_PACKAGES = ["api", "ai", "auth", "db", "storage", "logger"];

export interface Violation {
  package: string;
  issue: string;
  severity: "error" | "warning";
}

export function checkBoundaries(root = workspaceRoot(process.cwd())): Violation[] {
  const packages = workspacePackages(root);
  const violations: Violation[] = [];

  // Build dependency graph
  const graph = new Map<string, string[]>();
  for (const [name, pkg] of packages) {
    const deps = Object.keys(declaredDependencies(pkg.manifest)).filter((dep) => packages.has(dep));
    graph.set(name, deps);
  }

  // Check 1: Circular dependencies
  const cycles = findCycles(graph);
  for (const cycle of cycles) {
    violations.push({
      package: cycle[0]!,
      issue: `Circular dependency: ${cycle.join(" → ")}`,
      severity: "error",
    });
  }

  // Check 2: Browser packages importing server packages
  for (const [name, pkg] of packages) {
    const shortName = name.replace(/^@raypx\//, "");
    if (!BROWSER_PACKAGES.includes(shortName)) continue;

    const deps = Object.keys(declaredDependencies(pkg.manifest));
    for (const dep of deps) {
      const depShortName = dep.replace(/^@raypx\//, "");
      if (SERVER_PACKAGES.includes(depShortName)) {
        violations.push({
          package: name,
          issue: `Browser package cannot depend on server package ${dep}`,
          severity: "error",
        });
      }
      if (
        packages.has(dep) &&
        !["@raypx/config", "@raypx/tsconfig"].includes(dep) &&
        ((shortName === "client" && dep !== "@raypx/contracts") || shortName === "ui")
      ) {
        violations.push({
          package: name,
          issue: `${name} cannot depend on business workspace ${dep}`,
          severity: "error",
        });
      }
    }
  }

  return violations;
}

function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(node: string) {
    const cycleIndex = stack.indexOf(node);
    if (cycleIndex !== -1) {
      cycles.push([...stack.slice(cycleIndex), node]);
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    stack.push(node);
    for (const dep of graph.get(node) ?? []) {
      visit(dep);
    }
    stack.pop();
  }

  for (const node of graph.keys()) {
    visit(node);
  }

  return cycles;
}

// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = checkBoundaries();

  if (violations.length === 0) {
    console.log("✓ Workspace boundaries are clean");
    process.exit(0);
  }

  for (const v of violations) {
    const icon = v.severity === "error" ? "✗" : "⚠";
    console.error(`${icon} ${v.package}: ${v.issue}`);
  }

  const errors = violations.filter((v) => v.severity === "error").length;
  process.exit(errors > 0 ? 1 : 0);
}
