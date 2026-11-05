import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vite-plus/test";
import { nitroTarget } from "./nitro.ts";

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

it("builds API and Web with Nitro's Node preset", () => {
  expect(nitroTarget()).toEqual({
    preset: "node-server",
    features: { fastResponse: false },
    compatibilityDate: "2026-10-15",
    devServer: { hostname: "localhost" },
    serverDir: false,
    serverEntry: false,
  });
});

it.each(["api", "web"])("runs the %s image on Node as the node user", (app) => {
  const file = `apps/${app}/Dockerfile`;
  const runtime = stages(file).get("runtime")!;
  expect(runtime.from).toBe("node:${NODE_VERSION}-bookworm-slim");
  expect(runtime.lines).toContain("USER node");
  expect(runtime.lines.some((line) => line.includes("--chown=node:node"))).toBe(true);
  expect(runtime.lines.at(-1)).toBe('CMD ["node", ".output/server/index.mjs"]');
  expect(read(`apps/${app}/package.json`)).toContain('"start": "node .output/server/index.mjs"');
});

it.each([
  ["api", "./apps/api"],
  ["web", "./apps/web"],
  ["relay", "./infra/relay"],
])("installs only the %s dependency closure from manifests before copying source", (app, path) => {
  const file = app === "relay" ? "infra/relay/Dockerfile" : `apps/${app}/Dockerfile`;
  const all = stages(file);
  const dependencies = all.get("dependencies")!;
  expect(dependencies.lines).toContain("COPY --from=manifests /manifests/ ./");
  expect(
    dependencies.lines.some((line) =>
      line.includes("VP_GIT_HOOKS=0 pnpm install --frozen-lockfile"),
    ),
  ).toBe(true);
  expect(dependencies.lines).toContain(`    --filter . --filter '{${path}}...'`);
  expect(dependencies.lines).not.toContain("COPY . .");
  const build = all.get("build")!;
  expect(build.from).toBe("dependencies");
  expect(build.lines).toContain("COPY . .");
  expect(build.lines.join("\n")).not.toMatch(/pnpm install/);
});

it("keeps portable Dockerfiles and isolated pre-deploy migration payloads", () => {
  for (const file of ["apps/api/Dockerfile", "apps/web/Dockerfile", "infra/relay/Dockerfile"])
    expect(read(file)).not.toContain("--mount=type=cache");
  const all = stages("apps/api/Dockerfile");
  expect([...all.keys()].at(-1)).toBe("deploy");
  const deploy = all.get("deploy")!;
  expect(deploy.from).toBe("runtime");
  for (const payload of ["/migration/dist", "/migration/drizzle-foundation"])
    expect(deploy.lines.join("\n")).toContain(payload);
  expect(deploy.lines.join("\n")).not.toContain("fixture");
  const fixture = all.get("fixture")!;
  expect(fixture.from).toBe("node:${NODE_VERSION}-bookworm-slim");
  expect(fixture.lines).toContain('CMD ["node", "fixture/deployment.mjs"]');
  const migrate = all.get("migrate")!;
  expect(migrate.from).toBe("node:${NODE_VERSION}-bookworm-slim");
  expect(migrate.lines).toContain('CMD ["node", "migration/dist/commands.mjs", "migrate"]');
  expect(migrate.lines.join("\n")).not.toMatch(/node_modules|COPY \. \./);
});

it("probes Compose health with the pinned Node runtime", () => {
  const compose = read("deploy/compose.yaml");
  const probes = [...compose.matchAll(/test:\n\s+- CMD\n\s+- (\S+)\n\s+- -e/g)].map(
    (match) => match[1],
  );
  expect(probes).toEqual(["node", "node", "node"]);
  expect(compose).not.toMatch(/^\s+- bun$/m);
});
