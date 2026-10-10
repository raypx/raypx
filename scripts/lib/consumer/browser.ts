import { readFile, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { build, serve, file as bunFile } from "bun";
import { scriptLogger } from "../logger.ts";
import { run } from "../process.ts";
import { repository, type ConsumerFixture } from "./fixture.ts";
import { write } from "./manifest.ts";

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
  scriptLogger.success(
    `Consumer core browser: ${modules.size} compiled modules without React, Query, or server imports`,
  );
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
  scriptLogger.success(
    "Consumer browser: built public JS and compiled UI CSS without repository aliases",
  );
}

/** Exercise the compiled consumer through its own loopback server and Chromium process. */
export async function testBrowser(fixture: ConsumerFixture): Promise<void> {
  const directory = join(fixture.directory, "browser-dist");
  const server = serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      const path = join(directory, pathname === "/" ? "index.html" : decodeURIComponent(pathname));
      if (!path.startsWith(directory + sep)) return new Response("Not found", { status: 404 });
      const file = bunFile(path);
      if (!(await file.exists())) return new Response("Not found", { status: 404 });
      return new Response(file);
    },
  });
  try {
    const output = await run(
      "bun",
      ["run", "playwright", "test", "--config", join(repository, "playwright.consumer.config.ts")],
      repository,
      120_000,
      { RAYPX_CONSUMER_URL: String(server.url) },
    );
    scriptLogger.log(output.trim());
  } finally {
    await server.stop(true);
  }
}
