import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build, JSONC } from "bun";

export const repository = fileURLToPath(new URL("../../", import.meta.url));
type JsonObject = Record<string, unknown>;
type LockRecord = [string, ...unknown[]];
interface Lock {
  lockfileVersion: number;
  configVersion?: number;
  workspaces: JsonObject;
  packages: Record<string, LockRecord>;
  [key: string]: unknown;
}
interface Manifest extends JsonObject {
  name: string;
  version: string;
  exports: Record<string, unknown>;
}
export interface ConsumerFixture {
  directory: string;
  packages: Map<string, Manifest>;
  cleanup(): Promise<void>;
}

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a JSON object");
  return value as JsonObject;
}
function strings(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, item]) => {
      if (typeof item !== "string") throw new Error(`Expected a string dependency for ${key}`);
      return [key, item];
    }),
  );
}
async function json(path: string): Promise<JsonObject> {
  return object(JSON.parse(await readFile(path, "utf8")));
}
async function write(path: string, value: string | JsonObject): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
}

export async function run(
  command: string,
  args: string[],
  directory: string,
  timeoutMs = 120_000,
  extraEnvironment: NodeJS.ProcessEnv = {},
): Promise<string> {
  if (command === "bun" && !args.includes("--no-env-file")) args = ["--no-env-file", ...args];
  return new Promise((accept, reject) => {
    const child = spawn(command, args, {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        SystemRoot: process.env.SystemRoot,
        NODE_ENV: "test",
        CI: process.env.CI,
        ...extraEnvironment,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let output = "";
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-200_000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    let finished = false;
    let timedOut = false;
    let termination: ReturnType<typeof setTimeout> | undefined;
    const signal = (name: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32") child.kill(name);
        else process.kill(-child.pid, name);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) reject(error);
      }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      signal("SIGTERM");
      termination = setTimeout(() => {
        signal("SIGKILL");
        child.stdout.destroy();
        child.stderr.destroy();
        if (!finished) {
          finished = true;
          reject(
            new Error(`${command} timed out after ${timeoutMs} ms in ${directory}\n${output}`),
          );
        }
      }, 5000);
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(termination);
      finished = true;
      reject(error);
    });
    child.once("close", (code, exitSignal) => {
      clearTimeout(timeout);
      clearTimeout(termination);
      if (finished) return;
      finished = true;
      if (timedOut) signal("SIGKILL");
      if (timedOut || code !== 0)
        reject(
          new Error(
            timedOut
              ? `${command} timed out after ${timeoutMs} ms in ${directory}\n${output}`
              : `${command} ${args.join(" ")} failed (${exitSignal ?? code}) in ${directory}\n${output}`,
          ),
        );
      else accept(output);
    });
  });
}

function registrySpec(name: string, lock: Lock): string {
  const record = lock.packages[name];
  if (!record || typeof record[0] !== "string" || record[0].includes("@workspace:"))
    throw new Error(`No locked registry dependency: ${name}`);
  const id = record[0];
  const delimiter = id.lastIndexOf("@");
  const actualName = id.slice(0, delimiter);
  const version = id.slice(delimiter + 1);
  if (!/^\d+\./.test(version)) throw new Error(`Not a registry version: ${id}`);
  return actualName === name ? version : `npm:${id}`;
}

/** Reject a new registry version, changed integrity, or changed transitive resolution. */
export function assertLockedGraph(expected: Lock, actual: Lock): void {
  const parent = (key: string) => {
    const parts = key.split("/");
    parts.pop();
    if (parts.at(-1)?.startsWith("@")) parts.pop();
    return parts.join("/");
  };
  const edges = (lock: Lock, key: string, value: unknown) =>
    Object.fromEntries(
      Object.keys(strings(value))
        .sort()
        .map((name) => {
          let owner = key;
          while (owner) {
            const nested = lock.packages[`${owner}/${name}`];
            if (nested) return [name, nested[0]];
            owner = parent(owner);
          }
          const record = lock.packages[name];
          if (!record) throw new Error(`Missing locked transitive dependency: ${key} -> ${name}`);
          return [name, record[0]];
        }),
    );
  const signature = (lock: Lock, key: string, entry: LockRecord) =>
    JSON.stringify([
      entry.at(-1),
      edges(lock, key, object(entry[2] ?? {}).dependencies),
      edges(lock, key, object(entry[2] ?? {}).optionalDependencies),
    ]);
  for (const [key, record] of Object.entries(actual.packages)) {
    if (record[0].includes("@file:") || record[0].includes("@workspace:")) continue;
    const candidates = Object.entries(expected.packages).filter(
      ([, candidate]) => candidate[0] === record[0],
    );
    if (
      !candidates.some(
        ([expectedKey, candidate]) =>
          signature(expected, expectedKey, candidate) === signature(actual, key, record),
      )
    )
      throw new Error(`Consumer registry graph drifted from bun.lock: ${key} (${record[0]})`);
  }
}

function entries(manifest: Manifest): [string, unknown][] {
  return Object.entries(manifest.exports);
}
function condition(value: unknown, name: string): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = (value as JsonObject)[name];
  return typeof item === "string" ? item : undefined;
}
function specifier(manifest: Manifest, subpath: string): string {
  return subpath === "." ? manifest.name : `${manifest.name}/${subpath.slice(2)}`;
}

/** Builds a fresh, repository-independent installation from public package artifacts. */
export async function createFixture(kind: "core" | "server" | "browser"): Promise<ConsumerFixture> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), `raypx-consumer-${kind}-`)));
  const packages = new Map<string, Manifest>();
  const cleanup = () => rm(directory, { recursive: true, force: true });
  try {
    const original = JSONC.parse(await readFile(join(repository, "bun.lock"), "utf8")) as Lock;
    const requested =
      kind === "core"
        ? ["client", "contracts", "env"]
        : kind === "browser"
          ? ["ui", "client", "contracts", "env"]
          : [
              "api",
              "auth",
              "client",
              "config",
              "contracts",
              "db",
              "env",
              "logger",
              "storage",
              "ui",
              "worker",
            ];
    for (const name of requested) {
      const source = join(repository, "packages", name);
      const raw = await json(join(source, "package.json"));
      if (typeof raw.name !== "string" || typeof raw.version !== "string")
        throw new Error(`Invalid package manifest: ${name}`);
      const manifest = { ...raw, exports: object(raw.exports) } as Manifest;
      const artifact = join(directory, "artifacts", name);
      await mkdir(artifact, { recursive: true });
      // config intentionally exports TS tools; UI's shadcn condition exports source assets.
      if (name !== "config")
        await cp(join(source, "dist"), join(artifact, "dist"), { recursive: true });
      if (name === "ui" || name === "config")
        await cp(join(source, "src"), join(artifact, "src"), { recursive: true });
      if (name === "config")
        await cp(join(source, "tsconfig-presets"), join(artifact, "tsconfig-presets"), {
          recursive: true,
        });
      if (name === "db")
        await cp(join(source, "migrations"), join(artifact, "migrations"), { recursive: true });
      if (name === "ui")
        await cp(join(source, "SHADCN_LICENSE.md"), join(artifact, "SHADCN_LICENSE.md"));
      const dependencies = strings(manifest.dependencies);
      for (const [dependency, version] of Object.entries(dependencies)) {
        dependencies[dependency] = version.startsWith("workspace:")
          ? `file:../${dependency.split("/")[1]}`
          : registrySpec(dependency, original);
      }
      delete manifest.devDependencies;
      delete manifest.scripts;
      manifest.dependencies = dependencies;
      await write(join(artifact, "package.json"), manifest);
      packages.set(manifest.name, manifest);
      for (const [subpath, value] of entries(manifest)) {
        if (subpath.includes("*")) continue;
        for (const target of [
          condition(value, "import"),
          condition(value, "types"),
          condition(value, "shadcn"),
        ]) {
          if (!target) continue;
          const resolved = await realpath(join(artifact, target));
          if (!resolved.startsWith(artifact + sep))
            throw new Error(`Public asset escapes fixture: ${manifest.name} ${subpath}`);
        }
      }
    }
    const dependencies = Object.fromEntries(
      [...packages].map(([name]) => [name, `file:./artifacts/${name.split("/")[1]}`]),
    );
    const tools =
      kind === "core"
        ? ["typescript", "@types/node"]
        : [
            "typescript",
            "@types/node",
            "@types/react",
            "@types/react-dom",
            "react",
            "react-dom",
            "@tanstack/react-query",
            "vite",
            "vite-plus",
            "@vitejs/plugin-react",
            "@tailwindcss/vite",
            "tailwindcss",
            "tw-animate-css",
          ];
    for (const name of tools) dependencies[name] = registrySpec(name, original);
    const manifest = {
      name: `raypx-consumer-${kind}`,
      version: "0.0.0",
      private: true,
      type: "module",
      dependencies,
      trustedDependencies: kind === "server" ? ["better-sqlite3"] : [],
    };
    await write(join(directory, "package.json"), manifest);
    const seed = structuredClone(original);
    seed.workspaces = { "": { name: manifest.name, version: manifest.version, dependencies } };
    for (const key of Object.keys(seed.packages))
      if (seed.packages[key]?.[0].includes("@workspace:")) delete seed.packages[key];
    for (const [name, packageManifest] of packages) {
      const metadata: JsonObject = { dependencies: packageManifest.dependencies };
      if (packageManifest.peerDependencies)
        metadata.peerDependencies = packageManifest.peerDependencies;
      const optionalPeers = Object.entries(object(packageManifest.peerDependenciesMeta ?? {}))
        .filter(([, value]) => object(value).optional === true)
        .map(([peer]) => peer);
      if (optionalPeers.length) metadata.optionalPeers = optionalPeers;
      const identity = `${name}@file:artifacts/${name.split("/")[1]}`;
      seed.packages[name] = [identity, metadata];
    }
    // Bun deduplicates file records by identity; every alias must retain metadata.
    for (const [name, packageManifest] of packages)
      for (const dependency of Object.keys(strings(packageManifest.dependencies)))
        if (packages.has(dependency))
          seed.packages[`${name}/${dependency}`] = seed.packages[dependency]!;
    await write(join(directory, "bun.lock"), seed);
    const peerPolicy = kind === "core" ? ["--omit", "peer"] : [];
    await run("bun", ["install", "--lockfile-only", "--offline", ...peerPolicy], directory);
    const normalized = JSONC.parse(await readFile(join(directory, "bun.lock"), "utf8")) as Lock;
    assertLockedGraph(original, normalized);
    await run(
      "bun",
      ["install", "--frozen-lockfile", ...peerPolicy, "--prefer-offline"],
      directory,
    );
    console.log(`Consumer ${kind}: installed locked artifacts outside repository`);
    return { directory, packages, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export async function checkTypes(fixture: ConsumerFixture): Promise<void> {
  const core = fixture.directory.includes("-core-");
  const imports: string[] = [];
  for (const manifest of fixture.packages.values())
    for (const [subpath, value] of entries(manifest)) {
      const target = condition(value, "types");
      if (!target || !target.endsWith(".d.ts")) continue;
      if (core && subpath.startsWith("./react")) continue;
      const index = imports.length;
      imports.push(
        `import * as entry${index} from ${JSON.stringify(specifier(manifest, subpath))};\nexport type Entry${index} = typeof entry${index};`,
      );
    }
  const examples = `
import { requestJson, type JsonValue } from "@raypx/client/http";
import { signIn } from "@raypx/client/auth";
import { healthResponseSchema, type HealthResponse } from "@raypx/contracts/health";
import { parseClientEnv, type ClientEnv } from "@raypx/env/client";
const health: Promise<HealthResponse> = requestJson({path:"/api/health",schema:healthResponseSchema});
const publicEnv: ClientEnv = parseClientEnv({PRIVATE_SECRET:"omitted"});
const body: JsonValue = {items:[1,true,null,"safe"]};
void health; void publicEnv; void body;
signIn({email:"consumer@example.test",password:"consumer-password"});
// @ts-expect-error functions are not a JSON request body
requestJson({path:"/api/example",method:"POST",schema:healthResponseSchema,body:()=>"unsafe"});
// @ts-expect-error sign-in must include a password
signIn({email:"consumer@example.test"});
// @ts-expect-error schema inference must retain the structured response
const wrongResponse: Promise<number> = requestJson({path:"/api/health",schema:healthResponseSchema});
${
  core
    ? ""
    : `
import { Button, Input } from "@raypx/ui/components";
import { useDebouncedValue } from "@raypx/ui/hooks/debounce";
import { ClientProvider, createQueryClient, useHealthCheck } from "@raypx/client/react";
const queryClient = createQueryClient({defaultOptions:{queries:{retry:false}}});
export function ConsumerDisplay(){
 const value: string = useDebouncedValue("search",50);
 const status = useHealthCheck().status;
 // @ts-expect-error debounce must preserve its input type
 const invalid: number = useDebouncedValue("text",50);
 void invalid;
 return <ClientProvider client={queryClient}><Button variant="outline">{status}</Button><Input value={value} readOnly/></ClientProvider>;
}
// @ts-expect-error unknown UI variants must not become any
export const invalidButton = <Button variant="unknown-variant"/>;
`
}
`;
  await write(join(fixture.directory, "types.tsx"), imports.join("\n") + examples);
  for (const mode of ["NodeNext", "Bundler"]) {
    await write(join(fixture.directory, "tsconfig.json"), {
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        module: mode === "NodeNext" ? "NodeNext" : "ESNext",
        moduleResolution: mode,
        jsx: "react-jsx",
        types: ["node"],
      },
      include: ["types.tsx"],
    });
    await run("bun", ["run", "tsc", "-p", "tsconfig.json"], fixture.directory);
  }
  console.log(`Consumer types: ${imports.length} public entries in NodeNext and Bundler`);
}

/** Bundles framework-free browser entries with an inspected, React-free graph. */
export async function buildCoreBrowser(fixture: ConsumerFixture): Promise<void> {
  const entry = join(fixture.directory, "core-browser.ts");
  await write(
    entry,
    `
import { checkHealth, requestJson, signIn, getSession, ApiClientError } from "@raypx/client";
import { healthResponseSchema } from "@raypx/contracts/health";
import { parseClientEnv } from "@raypx/env/client";
export {checkHealth,requestJson,signIn,getSession,ApiClientError,healthResponseSchema,parseClientEnv};
`,
  );
  const modules = new Set<string>();
  const result = await build({
    entrypoints: [entry],
    target: "browser",
    outdir: join(fixture.directory, "core-browser-dist"),
    plugins: [
      {
        name: "framework-free-consumer",
        setup(builder) {
          builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async ({ path }) => {
            const location = await realpath(path);
            if (!location.startsWith(fixture.directory + sep))
              throw new Error(`Module escaped fixture: ${location}`);
            if (
              /(?:^|\/)node_modules\/(?:react|react-dom|@tanstack\/react-query)(?:\/|$)|(?:^|\/)(?:@raypx|artifacts)\/(?:api|auth|db|logger|storage|worker)(?:\/|$)|(?:^|\/)(?:@raypx|artifacts)\/env\/dist\/server|(?:^|\/)(?:@raypx|artifacts)\/client\/dist\/react\//.test(
                location,
              )
            )
              throw new Error(`Forbidden framework/server module in core browser: ${location}`);
            modules.add(location);
            return {
              contents: await readFile(location, "utf8"),
              loader: location.endsWith(".ts") ? "ts" : "js",
            };
          });
          builder.onResolve(
            {
              filter:
                /^(?:node:|bun:|react(?:\/|$)|react-dom(?:\/|$)|@tanstack\/react-query(?:\/|$)|@raypx\/(?:api|auth|db|logger|storage|worker)(?:\/|$)|@raypx\/env\/server(?:\/|$)|@raypx\/client\/react(?:\/|$))/,
            },
            ({ path }) => {
              throw new Error(`Forbidden browser import: ${path}`);
            },
          );
        },
      },
    ],
  });
  if (!result.success)
    throw new Error(
      `Core browser build failed: ${result.logs.map((log) => log.message).join("\n")}`,
    );
  if (!modules.size) throw new Error("Core browser graph was not inspected");
  console.log(
    `Consumer core browser: ${modules.size} compiled modules without React, Query, or server imports`,
  );
}

export async function checkRuntime(fixture: ConsumerFixture, core: boolean): Promise<void> {
  const imports: string[] = [];
  for (const manifest of fixture.packages.values())
    for (const [subpath, value] of entries(manifest)) {
      const target = condition(value, "import");
      if (!target?.endsWith(".js") || (core && subpath.startsWith("./react"))) continue;
      imports.push(specifier(manifest, subpath));
    }
  await write(
    join(fixture.directory, "smoke.mjs"),
    `
import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
for (const spec of ${JSON.stringify(imports)}) {
  const location = realpathSync(fileURLToPath(import.meta.resolve(spec)));
  assert(location.startsWith(${JSON.stringify(fixture.directory + sep)}), spec + " escaped fixture");
  await import(spec);
}
await assert.rejects(import("@raypx/client/dist/index.js"));
${
  core
    ? `
await assert.rejects(import("react"));
await assert.rejects(import("@tanstack/react-query"));
const { healthResponseSchema } = await import("@raypx/contracts/health");
assert.equal(healthResponseSchema.parse({status:"ok",service:"raypx-api"}).status, "ok");
const { parseClientEnv } = await import("@raypx/env/client");
assert.deepEqual(parseClientEnv({PRIVATE_SECRET:"not-public"}), {});
`
    : `
const { createDatabase, runMigrations, withTransaction } = await import("@raypx/db");
const { user } = await import("@raypx/db/schema");
const connection = createDatabase("./consumer.db");
try {
  runMigrations(connection.db); runMigrations(connection.db);
  assert.deepEqual(withTransaction(connection.db, tx => tx.select().from(user).all()), []);
  connection.checkHealth();
  const { createAuth } = await import("@raypx/auth");
  const auth = createAuth({database:connection.db,secret:"consumer-secret-".repeat(4),baseURL:"https://consumer.test",environment:"test"});
  assert.equal(await auth.api.getSession({headers:new Headers()}), null);
} finally { connection.close(); }
const { getStorage, closeStorage } = await import("@raypx/storage");
const { createCache } = await import("@raypx/storage/cache");
const storage = getStorage({memory:true});
try {
  const cache = createCache({storage,namespace:"consumer",schema:{parse(value){if(typeof value!=="string")throw new Error("Invalid value");return value}}});
  assert.equal(await cache.getOrSet("key",30,()=>"value"), "value");
  assert.deepEqual(await cache.get("key"), {hit:true,value:"value"});
  await cache.invalidate("key"); assert.deepEqual(await cache.get("key"),{hit:false});
} finally { await closeStorage(); }
const { healthResponse } = await import("@raypx/api/health");
assert.equal((await healthResponse().json()).status, "ok");
`
}
console.log("Consumer runtime passed: " + (process.versions.bun ? "Bun" : "Node"));
`,
  );
  for (const runtime of ["node", "bun"]) {
    const output = await run(
      runtime,
      runtime === "bun" ? ["--no-env-file", "smoke.mjs"] : ["smoke.mjs"],
      fixture.directory,
    );
    console.log(output.trim());
  }
}

export async function buildBrowser(fixture: ConsumerFixture): Promise<void> {
  await write(
    join(fixture.directory, "index.html"),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Independent consumer</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  );
  await write(
    join(fixture.directory, "src/styles.css"),
    '@import "tailwindcss";\n@import "tw-animate-css";\n@import "@raypx/ui/styles.css";\n@source "../node_modules/@raypx/ui/dist";\n',
  );
  await write(
    join(fixture.directory, "src/main.tsx"),
    `
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@raypx/ui/components/button";
import { Input } from "@raypx/ui/components";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@raypx/ui/components/dialog";
import { useDebouncedValue } from "@raypx/ui/hooks/debounce";
import { ClientProvider, createQueryClient, useHealthCheck } from "@raypx/client/react";
import { getClientEnv } from "@raypx/env/client";
import "./styles.css";
getClientEnv();
function App(){
 const [value,setValue]=useState(""); const debounced=useDebouncedValue(value,50); const {status}=useHealthCheck();
 return <main className="p-6 space-y-4"><h1>Independent consumer</h1><output aria-label="Connection">{status}</output>
 <label htmlFor="search">Search</label><Input id="search" value={value} onChange={event=>setValue(event.target.value)}/><output aria-label="Debounced value">{debounced}</output>
 <Button onClick={()=>document.documentElement.classList.toggle("dark")}>Toggle theme</Button>
 <Dialog><DialogTrigger asChild><Button>Open dialog</Button></DialogTrigger><DialogContent><DialogTitle>Consumer dialog</DialogTitle><DialogDescription>Built package portal</DialogDescription><Input aria-label="Dialog input"/></DialogContent></Dialog></main>;
}
createRoot(document.getElementById("root")!).render(<ClientProvider client={createQueryClient()}><App/></ClientProvider>);
`,
  );
  await write(
    join(fixture.directory, "vite.config.mjs"),
    `
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({envDir:false,plugins:[react(),tailwindcss(),{
 name:"consumer-boundary",resolveId(source){
  if(/^(?:node:|bun:|@raypx\\/(?:api|auth|db|logger|storage|worker)(?:\\/|$)|@raypx\\/env\\/server(?:\\/|$))/.test(source)) this.error("Server import in browser: "+source);
  return null;
 },generateBundle(){
  for(const id of this.getModuleIds()){
   if(/(?:^|\\/)(?:@raypx|artifacts)\\/(?:api|auth|db|logger|storage|worker)(?:\\/|$)|(?:^|\\/)(?:@raypx|artifacts)\\/env\\/dist\\/server|^(?:node|bun):|__vite-browser-external/.test(id)) this.error("Server dependency in browser: "+id);
   if(id.includes(${JSON.stringify(repository)})) this.error("Repository source in consumer: "+id);
  }
 }
}],build:{outDir:"browser-dist"}});
`,
  );
  await run("bun", ["run", "vp", "build"], fixture.directory);
  console.log("Consumer browser: built public JS and compiled UI CSS without repository aliases");
}
