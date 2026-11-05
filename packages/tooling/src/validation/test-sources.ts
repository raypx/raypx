import { globFiles } from "@raypx/runtime-node/files";
export type TestLayer = "unit" | "component" | "integration" | "external";

/** Source-adjacent suites and the separately owned integration/acceptance directories. */
export function testSources(directory: string): string[] {
  return [
    ...globFiles("{src,server,scripts,tests,e2e}/**/*.{test,spec}.{ts,tsx}", {
      cwd: directory,
    }),
    ...globFiles("*.{test,spec}.{ts,tsx}", { cwd: directory }),
  ]
    .map((file) => file.replaceAll("\\", "/"))
    .sort();
}

export function testLayer(file: string, external = false): TestLayer {
  if (external || file.startsWith("e2e/") || /^tests\/(?:postgres|redis|cluster)\//.test(file))
    return "external";
  if (/\.component\.(?:test|spec)\.[jt]sx?$/.test(file)) return "component";
  if (file.startsWith("tests/integration/")) return "integration";
  return "unit";
}
