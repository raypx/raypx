import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { imports } from "@raypx/devkit/architecture";
import { resolveImport, workspaceFor } from "@raypx/devkit/workspaces";
import { discover } from "../repository.js";
import { taskModel, taskRef } from "@raypx/tooling/tasks/model";
import { testLayer, testSources } from "../validation/test-sources.js";
import type { VerificationPlan } from "./plan.js";
import { relatedTaskLifecycle } from "@raypx/tooling/tasks/lifecycle";

export interface TestSelection {
  workspace: string;
  task: string;
  mode: "all" | "related" | "none";
  /** Workspace-relative paths, passed only to this workspace's existing test script. */
  files: string[];
  reasons: string[];
}
const code = /\.[cm]?[jt]sx?$/;
const documentation = /(?:^docs\/|(?:^|\/)(?:README|AGENTS|CHANGELOG|LICENSE)(?:\.md)?$)/;
const testOnly = /(?:^|\/)tests\/|\.(?:test|spec)\.[cm]?[jt]sx?$|\/test-utils(?:\/|\.)/;
const extensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/** CI/full mode retains complete suites. Local selection never changes the canonical CI plan. */
export function localTests(root: string, plan: VerificationPlan): TestSelection[] {
  if (!plan.tasks.some((task) => task.endsWith("#task:test"))) return [];
  const model = taskModel(root),
    index = discover(root);
  const changed = plan.files.filter((file) => !documentation.test(file));
  const lifecycle = relatedTaskLifecycle(model, changed);
  const broad = plan.full || plan.reasons.length > 0;
  const parsed = new Map<string, { paths: string[]; opaque: boolean }>();
  function edges(file: string) {
    const cached = parsed.get(file);
    if (cached) return cached;
    const owner = workspaceFor(index, file);
    const source = readFileSync(join(root, file), "utf8");
    if (/\b(?:import|require)\s*\(\s*(?!\s*["'`])/.test(source))
      throw new Error(`Computed test dependency: ${file}`);
    const requests = imports(file, source);
    const result = {
      paths: owner
        ? requests.flatMap(({ request }) =>
            resolveImport(index, owner, file, request).paths.flatMap((path) => {
              const base = path.replace(/\.[cm]?js$/, "");
              const candidates = [
                path,
                ...extensions.map((ext) => base + ext),
                ...extensions.map((ext) => `${base}/index${ext}`),
              ];
              const found = candidates.find(
                (candidate) =>
                  existsSync(join(root, candidate)) && statSync(join(root, candidate)).isFile(),
              );
              if (!found) throw new Error(`Unresolved test dependency: ${file} -> ${request}`);
              return found;
            }),
          )
        : [],
      // Filesystem assertions and subprocesses have dependencies beyond static imports.
      opaque:
        testOnly.test(file) &&
        (requests.some(({ request }) => /^(?:node:)?(?:fs|child_process)(?:\/|$)/.test(request)) ||
          /\bBun\.(?:file|spawn|spawnSync|Glob)\b|\bimport\.meta\.glob\b/.test(source)),
    };
    parsed.set(file, result);
    return result;
  }
  function related(test: string, files: Set<string>, sourceChanged: boolean) {
    const seen = new Set<string>(),
      queue = [test];
    let matches = false;
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      matches ||= files.has(file);
      if (!code.test(file)) continue;
      const entry = edges(file);
      matches ||= sourceChanged && entry.opaque;
      queue.push(
        ...entry.paths.filter(
          (path) => workspaceFor(index, path)?.path === workspaceFor(index, test)?.path,
        ),
      );
    }
    return matches;
  }
  return model.members
    .filter((member) => plan.tasks.includes(taskRef(member.name, "test")))
    .map((member) => {
      const entry: TestSelection = {
        workspace: member.name,
        task: taskRef(member.name, "test"),
        mode: "all",
        files: [],
        reasons: [],
      };
      const all = (reason: string) => ({ ...entry, reasons: [reason] });
      if (broad)
        return all(plan.full ? "Full verification" : "Shared or unknown verification inputs");
      const own = changed.filter((file) => file.startsWith(member.path + "/"));
      const lifecycleFile = lifecycle?.workspace === member.name ? lifecycle.file : undefined;
      if (!own.length) {
        if (!changed.every((file) => testOnly.test(file)))
          return all("Affected consumer: run its complete suite");
        if (lifecycleFile)
          return {
            ...entry,
            mode: "related",
            files: [lifecycleFile],
            reasons: ["The CLI lifecycle suite launches the changed API relay fixture"],
          };
        return { ...entry, mode: "none", reasons: ["Only another workspace's tests changed"] };
      }
      if (own.some((file) => !existsSync(join(root, file)))) return all("Deleted or renamed input");
      if (
        own.some(
          (file) =>
            !code.test(file) ||
            /(?:^|\/)(?:package\.json|[^/]*config[^/]*|setup\.[^/]+)$/.test(file) ||
            /\/tests\/(?!.*\.(?:test|spec)\.)/.test(file),
        )
      )
        return all("Configuration, fixture, setup or non-code input");
      if (!/\bvp test\b/.test(member.scripts.test!)) return all("Custom test runner");
      const sources = testSources(join(root, member.path)).filter(
        (file) => testLayer(file) !== "external",
      );
      if (!sources.length)
        return all("No ordinary test sources found; let the runner validate its suite");
      const files = new Set(own);
      if (lifecycleFile) files.add(`${member.path}/${lifecycleFile}`);
      const sourceChanged = own.some((file) => !testOnly.test(file));
      try {
        const selected = sources.filter(
          (file) =>
            (sourceChanged && testLayer(file) === "integration") ||
            related(`${member.path}/${file}`, files, sourceChanged),
        );
        // An unreferenced source may be loaded through a registry, filesystem or dynamic import.
        for (const file of own.filter((candidate) => !testOnly.test(candidate))) {
          if (!sources.some((test) => related(`${member.path}/${test}`, new Set([file]), false)))
            return all(`No static test dependency found: ${file}`);
        }
        if (!selected.length) return all("No related tests found; run the complete suite");
        return {
          ...entry,
          mode: "related",
          files: selected,
          reasons: [
            "Changed tests and transitive source imports; retain integration and filesystem/process checks",
          ],
        };
      } catch {
        return all("Test dependencies could not be resolved statically");
      }
    });
}
