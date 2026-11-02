export type TestLayer = "unit" | "component" | "integration" | "external";

/** Source-adjacent suites and the separately owned integration/acceptance directories. */
export function testSources(directory: string): string[] {
  return [
    ...new Bun.Glob("{src,server,scripts,tests}/**/*.{test,spec}.{ts,tsx}").scanSync({
      cwd: directory,
    }),
    ...new Bun.Glob("*.{test,spec}.{ts,tsx}").scanSync({ cwd: directory }),
  ]
    .map((file) => file.replaceAll("\\", "/"))
    .sort();
}

export function testLayer(file: string, external = false): TestLayer {
  if (external || /^tests\/(?:postgres|redis|cluster)\//.test(file)) return "external";
  if (/\.component\.(?:test|spec)\.[jt]sx?$/.test(file)) return "component";
  if (file.startsWith("tests/integration/")) return "integration";
  return "unit";
}
