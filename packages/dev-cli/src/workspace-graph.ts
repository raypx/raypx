import { discover, type Workspace } from "./repo/workspaces.js";
import type { BrowserSurface } from "./browser-tests.js";

export interface Member {
  name: string;
  path: string;
  scripts: Record<string, string>;
  /** Internal and external names from dependencies and devDependencies. */
  dependencies: string[];
  /** Owns the Go host: packaging and host checks run beside its renderer tasks. */
  native: boolean;
  /** Package exports point into `tests/`, so its tests can reach other workspaces. */
  testExports: boolean;
  browserProject?: BrowserSurface;
}
export interface WorkspaceGraph {
  root: string;
  rootName: string;
  members: Member[];
}

/** Turbo task identity; the repository root is `//`. */
const rootName = "//";
export const taskRef = (owner: string, name: string) => `${owner}#${name}`;

function member(workspace: Workspace): Member {
  const scripts = workspace.manifest.scripts ?? {};
  const browserProject = (
    workspace.manifest.raypx as { browserTestProject?: BrowserSurface } | undefined
  )?.browserTestProject;
  if (browserProject && (!["web", "desktop"].includes(browserProject) || !scripts.e2e))
    throw new Error(
      `${workspace.manifest.name}: browserTestProject requires web/desktop and an e2e script`,
    );
  return {
    name: workspace.manifest.name,
    path: workspace.path,
    scripts,
    dependencies: [
      ...new Set([
        ...Object.keys(workspace.manifest.dependencies ?? {}),
        ...Object.keys(workspace.manifest.devDependencies ?? {}),
      ]),
    ],
    native: Boolean(scripts["native:build"] && scripts["native:prepare"]),
    testExports: JSON.stringify(workspace.manifest.exports ?? {}).includes("./tests/"),
    ...(browserProject ? { browserProject } : {}),
  };
}

/** Workspaces, their scripts and dependency edges; Turbo owns scheduling and caching. */
export function workspaceGraph(root: string): WorkspaceGraph {
  const index = discover(root, { metadataKey: "raypx" });
  if (index.findings.length) throw new Error(index.findings.join("\n"));
  return { root, rootName, members: index.workspaces.map(member) };
}

/** True when a changed file can affect only its own workspace's checks and tests. */
export function privateTestFile(owner: Pick<Member, "path" | "testExports">, file: string) {
  if (!file.startsWith(`${owner.path}/`)) return false;
  const path = file.slice(owner.path.length + 1);
  return (
    path === "vitest.config.ts" ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) ||
    (!owner.testExports && path.startsWith("tests/"))
  );
}
