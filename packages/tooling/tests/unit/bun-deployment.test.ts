import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vite-plus/test";
import { nitroTarget } from "../../src/build/nitro.js";

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

it("builds API and Web with Nitro's Bun preset", () => {
  expect(nitroTarget()).toEqual({
    preset: "bun",
    compatibilityDate: "2026-10-15",
    devServer: { hostname: "localhost" },
    serverDir: false,
    serverEntry: false,
  });
});

it.each(["api", "web"])("runs the %s image on Bun as the bun user", (app) => {
  const file = `apps/${app}/Dockerfile`;
  const runtime = stages(file).get("runtime")!;
  expect(runtime.from).toMatch(/^oven\/bun:\d+\.\d+\.\d+-slim$/);
  expect(runtime.lines).toContain("USER bun");
  expect(runtime.lines.some((line) => line.includes("--chown=bun:bun"))).toBe(true);
  expect(runtime.lines.at(-1)).toBe('CMD ["bun", ".output/server/index.mjs"]');
  expect(read(`apps/${app}/package.json`)).toContain('"start": "bun .output/server/index.mjs"');
});

it.each(["api", "web"])("installs %s dependencies from manifests before copying source", (app) => {
  const file = `apps/${app}/Dockerfile`;
  const all = stages(file);
  const dependencies = all.get("dependencies")!;
  expect(dependencies.lines).toContain("COPY --from=manifests /manifests/ ./");
  expect(dependencies.lines.join("\n")).toMatch(/VP_GIT_HOOKS=0 bun install --frozen-lockfile/);
  expect(dependencies.lines).not.toContain("COPY . .");
  const build = all.get("build")!;
  expect(build.from).toBe("dependencies");
  expect(build.lines).toContain("COPY . .");
  expect(build.lines.join("\n")).not.toMatch(/bun install/);
});

it("shares identical dependency stages so one builder reuses the install", () => {
  const shared = (file: string) =>
    ["bun", "manifests", "dependencies"].map((name) => stages(file).get(name));
  expect(shared("apps/web/Dockerfile")).toEqual(shared("apps/api/Dockerfile"));
  // The migration image keeps database production dependencies only.
  expect(stages("apps/api/Dockerfile").get("migrate-dependencies")!.lines.join("\n")).toMatch(
    /--production --filter @raypx\/database --ignore-scripts/,
  );
});

it("probes Compose health with Bun instead of Node", () => {
  const compose = read("deploy/compose.yaml");
  const probes = [...compose.matchAll(/test:\n\s+- CMD\n\s+- (\S+)\n\s+- -e/g)].map(
    (match) => match[1],
  );
  expect(probes).toEqual(["bun", "bun"]);
  expect(compose).not.toMatch(/^\s+- node$/m);
});

it("caches Rust CI without repeating clippy's check or test's build", () => {
  const steps = read(".github/workflows/rust.yml");
  expect(steps).toContain("uses: Swatinem/rust-cache@v2");
  expect(steps).not.toMatch(/cargo (check|build)\b/);
  for (const command of [
    "cargo fmt --all -- --check",
    "cargo clippy --workspace --exclude raypx-desktop --all-targets --all-features --locked -- -D warnings",
    "cargo test --workspace --exclude raypx-desktop --all-features --locked",
  ])
    expect(steps).toContain(command);
  // The cache restores after the toolchain is selected and before any cargo command.
  expect(steps.indexOf("rustup show")).toBeLessThan(steps.indexOf("rust-cache"));
  expect(steps.indexOf("rust-cache")).toBeLessThan(steps.indexOf("cargo fmt"));
});
