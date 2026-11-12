import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

/** Dockerfile stages keyed by their `AS` name, each with its instruction lines. */
function stages(file: string) {
  const result = new Map<string, { from: string; lines: string[] }>();
  let current: string[] | undefined;
  for (const line of read(file).split("\n")) {
    const from = /^FROM\s+(\S+)\s+AS\s+(\S+)/.exec(line);
    if (from) {
      current = [];
      result.set(from[2]!, { from: from[1]!, lines: current });
    } else if (current && line.trim() && !line.startsWith("#")) current.push(line);
  }
  return result;
}

const api = stages("apps/api/Dockerfile");
const web = stages("apps/web/Dockerfile");

it("shares a frozen dependency layer before copying application sources", () => {
  const shared = (image: typeof api) =>
    ["bun", "manifests", "dependencies"].map((name) => image.get(name));
  expect(shared(web)).toEqual(shared(api));
  const dependencies = api.get("dependencies")!;
  expect(dependencies.lines).toContain("COPY --from=manifests /manifests/ ./");
  expect(dependencies.lines.join("\n")).toMatch(/VP_GIT_HOOKS=0 bun install --frozen-lockfile/);
  expect(dependencies.lines).not.toContain("COPY . .");
  for (const image of [api, web]) {
    const build = image.get("build")!;
    expect(build.from).toBe("dependencies");
    expect(build.lines).toContain("COPY . .");
    expect(build.lines.join("\n")).not.toMatch(/bun install/);
  }
});

it("runs the images unprivileged and keeps migration inputs separate", () => {
  for (const runtime of [api.get("runtime"), web.get("runtime"), api.get("migrate")])
    expect(runtime?.lines).toContain("USER bun");
  expect(api.get("migrate-dependencies")!.lines.join("\n")).toMatch(
    /--production --filter @raypx\/database --ignore-scripts/,
  );
  expect(api.get("migrate")?.from).toBe("bun");
  expect(api.get("migration-payload")?.from).toBe("migrate-dependencies");
  expect(api.get("deploy")?.from).toBe("runtime");
  expect(api.get("deploy")?.lines.join("\n")).toContain("COPY --from=migration-payload");
});
