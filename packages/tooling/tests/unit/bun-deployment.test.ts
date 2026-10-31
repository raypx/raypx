import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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

it("shares portable Dockerfiles with Railway and retains isolated pre-deploy migrations", () => {
  const configuration = pathToFileURL(join(root, ".railway/railway.ts")).href;
  const result = spawnSync(
    process.execPath,
    [
      "--no-env-file",
      "-e",
      `import program from ${JSON.stringify(configuration)};
const project = program({projectId:"766ffb45-d60f-4e4d-83b1-135443ff0b51",environment:"production"});
console.log(JSON.stringify(project.resources));`,
    ],
    { encoding: "utf8", env: { ...process.env, RAILWAY_IAC_CONTEXT: "" } },
  );
  expect(result.status).toBe(0);
  const services = JSON.parse(result.stdout) as {
    name: string;
    build: { dockerfilePath: string; watchPatterns: string[] };
    deploy: { preDeployCommand?: string[]; healthcheckPath: string };
  }[];
  for (const app of ["api", "web"]) {
    const service = services.find(({ name }) => name === app)!;
    const file = `apps/${app}/Dockerfile`;
    expect(service.build.dockerfilePath).toBe(file);
    expect(service.build.watchPatterns).toContain(`apps/${app}/**`);
    expect(read(file)).not.toContain("--mount=type=cache");
  }
  const api = services.find(({ name }) => name === "api")!;
  expect(api.deploy.preDeployCommand).toEqual(["bun run --cwd packages/database migrate"]);
  expect(api.deploy.healthcheckPath).toBe("/ready");
  expect(services.find(({ name }) => name === "web")!.deploy.healthcheckPath).toBe("/health");
  const all = stages("apps/api/Dockerfile");
  expect([...all.keys()].at(-1)).toBe("railway");
  expect(all.get("railway")).toEqual({
    from: "runtime",
    lines: [
      "COPY --from=migrate-dependencies --chown=bun:bun /app/ ./",
      "COPY --chown=bun:bun packages/database/src/ ./packages/database/src/",
      "COPY --chown=bun:bun packages/database/drizzle-foundation/ ./packages/database/drizzle-foundation/",
    ],
  });
  expect(all.get("migrate")!.from).toBe("bun");
});

it("probes Compose health with Bun instead of Node", () => {
  const compose = read("deploy/compose.yaml");
  const probes = [...compose.matchAll(/test:\n\s+- CMD\n\s+- (\S+)\n\s+- -e/g)].map(
    (match) => match[1],
  );
  expect(probes).toEqual(["bun", "bun"]);
  expect(compose).not.toMatch(/^\s+- node$/m);
});
