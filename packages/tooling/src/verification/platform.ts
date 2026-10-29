import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { imports } from "@raypx-kit/devkit/architecture";
import {
  discover,
  resolveImport,
  sourceTarget,
  workspaceFor,
  type Target,
  type Workspace,
} from "@raypx-kit/devkit/workspaces";

const code = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];
const frontend = /\.(?:[cm]?[jt]sx?|css|svg|png|jpe?g|webp|gif|ico|woff2?)$/;
const testOnly = /(?:^|\/)tests?\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;
const ignored = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.output/**",
  "**/build/**",
  "**/artifacts/**",
  "**/*.d.ts",
];

/**
 * Browser code reaches other platforms only through imports that architecture policy rejects at
 * runtime. Type-only imports and tests bypass that check, so they are scanned here: a workspace
 * whose non-browser code still imports browser code forwards browser changes to every consumer.
 */
export function browserReach(root: string) {
  const index = discover(root, { metadataKey: "raypx" });
  const scans = new Map<string, { consumes: boolean; leaks: boolean }>();
  function located(workspace: Workspace, path: string): Target {
    const base = path.replace(/\.[cm]?js$/, "");
    const file = [path, ...code.map((ext) => `${base}.${ext}`)]
      .concat(code.map((ext) => `${base}/index.${ext}`))
      .find((candidate) => existsSync(join(root, candidate)));
    // JSON and other data imports carry no platform code.
    if (file && !code.some((ext) => file.endsWith(`.${ext}`))) return "universal";
    return sourceTarget(workspace, file ?? path);
  }
  function scan(workspace: Workspace) {
    const known = scans.get(workspace.manifest.name);
    if (known) return known;
    const metadata = workspace.metadata;
    const declared = [
      metadata?.target,
      ...Object.values(metadata?.entryTargets ?? {}),
      ...Object.values(metadata?.sourceTargets ?? {}),
    ];
    const result = { consumes: declared.includes("browser"), leaks: false };
    const files = globSync(`${workspace.path}/**/*.{${code.join(",")}}`, {
      cwd: root,
      exclude: ignored,
    });
    for (const found of files) {
      const file = found.replaceAll("\\", "/");
      const browser = sourceTarget(workspace, file) === "browser";
      // A declared browser consumer only needs its non-browser sources checked for leaks.
      if (browser && result.consumes) continue;
      const leaking = !browser && !testOnly.test(file.slice(workspace.path.length + 1));
      let edges;
      try {
        edges = imports(file, readFileSync(join(root, file), "utf8"));
      } catch {
        result.consumes = true;
        result.leaks ||= leaking;
        continue;
      }
      for (const { request } of edges) {
        const resolved = resolveImport(index, workspace, file, request);
        if (!resolved.target) continue;
        const local = resolved.target === workspace;
        const target = local
          ? located(workspace, resolved.paths[0] ?? file)
          : resolved.targetPlatform;
        if (target !== "browser") continue;
        if (!local) result.consumes = true;
        if (leaking) result.leaks = true;
      }
    }
    scans.set(workspace.manifest.name, result);
    return result;
  }
  const member = (name: string) => {
    const workspace = index.byName.get(name);
    return workspace ? scan(workspace) : { consumes: true, leaks: true };
  };
  return {
    /** Frontend sources and assets whose declared platform is the browser. */
    browserOnly(file: string) {
      const workspace = workspaceFor(index, file);
      return Boolean(
        workspace && frontend.test(file) && sourceTarget(workspace, file) === "browser",
      );
    },
    /** The workspace contains browser code or imports a browser entry, including types and tests. */
    consumes: (name: string) => member(name).consumes,
    /** Non-browser, non-test sources import browser code, so its consumers cannot be narrowed. */
    leaks: (name: string) => member(name).leaks,
  };
}
