export type TestLayer = "unit" | "component" | "integration" | "external";

export function usesBunTest(script: string | undefined) {
  return /^bun(?: --no-env-file| --no-install)* test(?:\s|$)/.test(script ?? "");
}

/** Source-adjacent suites and the separately owned integration/acceptance directories. */
export function testSources(directory: string): string[] {
  return [
    ...new Bun.Glob("{src,server,scripts,tests,e2e}/**/*.{test,spec}.{ts,tsx}").scanSync({
      cwd: directory,
    }),
    ...new Bun.Glob("*.{test,spec}.{ts,tsx}").scanSync({ cwd: directory }),
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
