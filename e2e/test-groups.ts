import { readdirSync } from "node:fs";

export type BrowserSuite = "all" | "web" | "desktop";
type BrowserApp = Exclude<BrowserSuite, "all">;

/** Each spec belongs to one group; the default run remains their complete union. */
const groups = {
  smoke: {
    web: ["web", "homepage"],
    desktop: ["desktop"],
  },
  projects: {
    web: ["authenticated-web", "redesign"],
    desktop: ["desktop-redesign"],
  },
  workbench: { web: ["workbench"], desktop: [] },
  cloud: { web: ["cloud", "session-revocation-cloud"], desktop: [] },
} as const;

function assertGroupCoverage() {
  const declared = Object.values(groups)
    .flatMap((group) => [...group.web, ...group.desktop])
    .map((file) => `${file}.spec.ts`);
  const specs = readdirSync(new URL("./tests", import.meta.url), {
    recursive: true,
    encoding: "utf8",
  })
    .filter((file) => file.endsWith(".spec.ts"))
    .map((file) => file.replaceAll("\\", "/"));
  const missing = specs.filter((file) => !declared.includes(file));
  const stale = declared.filter((file) => !specs.includes(file));
  const duplicates = declared.filter((file, index) => declared.indexOf(file) !== index);
  if (missing.length || stale.length || duplicates.length)
    throw new Error(
      `E2E test groups must cover every spec exactly once. Unassigned: ${missing.join(", ") || "none"}; missing files: ${stale.join(", ") || "none"}; duplicates: ${duplicates.join(", ") || "none"}. Update e2e/test-groups.ts.`,
    );
}

export function browserProjects(suite: BrowserSuite, group?: string) {
  assertGroupCoverage();
  if (group && !Object.hasOwn(groups, group))
    throw new Error(`Unknown E2E group '${group}'. Choose ${Object.keys(groups).join(", ")}.`);
  const selected = group ? [groups[group as keyof typeof groups]] : Object.values(groups);
  const apps: BrowserApp[] = suite === "all" ? ["web", "desktop"] : [suite];
  const projects = apps.flatMap((name) => {
    const files = selected.flatMap((entry) => [...entry[name]]);
    return files.length
      ? [{ name, testMatch: new RegExp(`(?:^|[\\\\/])(?:${files.join("|")})\\.spec\\.ts$`) }]
      : [];
  });
  if (!projects.length) throw new Error(`E2E group '${group}' has no tests for ${suite}.`);
  return projects;
}
