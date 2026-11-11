import { afterEach, expect, it } from "vite-plus/test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startBrowserPreview } from "../../src/browser-server.js";

const servers: Awaited<ReturnType<typeof startBrowserPreview>>[] = [];
const roots: string[] = [];
const html =
  '<meta http-equiv="Content-Security-Policy" content="default-src self"><h1>Compiled 中😀</h1>';
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "raypx-browser-artifact-"));
  roots.push(directory);
  const client = join(directory, "client");
  await mkdir(join(client, "assets"), { recursive: true });
  await writeFile(join(client, "index.html"), html);
  await writeFile(join(client, "assets/app.js"), "export const compiled = true;");
  await writeFile(join(client, "assets/app.css"), "body { color: black; }");
  await writeFile(join(directory, "private.txt"), "outside-artifact");
  const server = await startBrowserPreview({ directory: client, port: 0 });
  servers.push(server);
  return {
    directory,
    client,
    server,
    request: (path: string, init?: RequestInit) => fetch(new URL(path, server.url), init),
  };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)));
  await Promise.all(
    roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

it("serves the original compiled HTML/CSP and extensionless deep links", async () => {
  const f = await fixture();
  for (const path of ["/", "/tasks?scope=remote", "/memory"]) {
    const response = await f.request(path, { headers: { accept: "text/html" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toBe(html);
  }
});
it("serves asset bytes, MIME and HEAD metadata without an HTML rewrite", async () => {
  const f = await fixture();
  const js = await f.request("/assets/app.js?v=1");
  expect(await js.text()).toBe("export const compiled = true;");
  expect(js.headers.get("content-type")).toContain("javascript");
  const css = await f.request("/assets/app.css");
  expect(css.headers.get("content-type")).toContain("text/css");
  const head = await f.request("/", { method: "HEAD" });
  expect(await head.text()).toBe("");
  expect(head.headers.get("content-length")).toBe(String(new TextEncoder().encode(html).length));
});
it("does not disguise missing assets or backend paths as the SPA", async () => {
  const f = await fixture();
  for (const path of [
    "/assets/missing.js",
    "/assets/missing",
    "/api/auth/get-session",
    "/rpc/account/get",
    "/missing.json",
  ]) {
    expect((await f.request(path, { headers: { accept: "text/html" } })).status).toBe(404);
  }
  const post = await f.request("/tasks", { method: "POST" });
  expect(post.status).toBe(405);
  expect(post.headers.get("allow")).toBe("GET, HEAD");
});
it("rejects malformed and encoded traversal paths", async () => {
  const f = await fixture();
  expect((await f.request("/%E0%A4")).status).toBe(400);
  expect((await f.request("/%00")).status).toBe(400);
  expect((await f.request("/..%2Fprivate.txt")).status).toBe(404);
});
it.skipIf(process.platform === "win32")("never serves an out-of-artifact symlink", async () => {
  const f = await fixture();
  await symlink(join(f.directory, "private.txt"), join(f.client, "leak.txt"));
  expect((await f.request("/leak.txt")).status).toBe(404);
});
