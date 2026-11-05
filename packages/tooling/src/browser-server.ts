import { serveHttp } from "@raypx/runtime-node/http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";

function inside(directory: string, path: string) {
  const local = relative(directory, path);
  return local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local);
}

/** Serve the compiled Desktop SPA only; no Vite plugins, SSR or Native bridge. */
export async function startBrowserPreview({
  directory,
  port,
}: {
  directory: string;
  port: number;
}) {
  const root = await realpath(directory);
  const index = await realpath(join(root, "index.html"));
  if (!inside(root, index) || !(await stat(index)).isFile())
    throw new Error("Build the Desktop renderer before browser acceptance");
  return await serveHttp({
    hostname: "127.0.0.1",
    port,
    async fetch(request) {
      if (request.method !== "GET" && request.method !== "HEAD")
        return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response(null, { status: 400 });
      }
      if (pathname.includes("\\") || pathname.includes("\0"))
        return new Response(null, { status: 400 });
      const candidate = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!inside(root, candidate)) return new Response(null, { status: 404 });
      const canonical = await realpath(candidate).catch(() => undefined);
      if (canonical && !inside(root, canonical)) return new Response(null, { status: 404 });
      let file = canonical && (await stat(canonical)).isFile() ? canonical : undefined;
      if (
        !file &&
        request.headers.get("accept")?.includes("text/html") &&
        !extname(pathname) &&
        !/^\/(?:assets|api|rpc)(?:\/|$)/.test(pathname)
      )
        file = index;
      if (!file) return new Response(null, { status: 404 });
      const body = await readFile(file);
      return new Response(request.method === "HEAD" ? null : body, {
        headers: {
          "content-type":
            (
              {
                ".html": "text/html; charset=utf-8",
                ".js": "text/javascript",
                ".mjs": "text/javascript",
                ".css": "text/css",
                ".json": "application/json",
                ".svg": "image/svg+xml",
                ".png": "image/png",
                ".woff2": "font/woff2",
              } as Record<string, string>
            )[extname(file)] ?? "application/octet-stream",
          "content-length": String((await stat(file)).size),
          "cache-control": "no-cache",
        },
      });
    },
  });
}
