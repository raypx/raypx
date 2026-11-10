import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RootGrant } from "@raypx/contracts/local";
import type { JobDefinition, JobRun } from "@raypx/core/jobs";
import type { ContextDocument, ContextDocumentSummary } from "@raypx/core/memory";
import type { ObservedProjection } from "@raypx/contracts/terminal";
import { messages } from "@raypx/i18n/messages";
import { DEVICE_PREFERENCES_KEY } from "../../../preferences";
import { CONNECTION_KEY } from "../../../config";
import { nativePresentation } from "../../../scripts/host/presentation";
import { instanceFixture } from "../fixtures/instance-server";
import { smokeOwnerIdentity } from "./owner";
import {
  engine,
  trayAction,
  nativeWindow,
  apiOrigin,
  desktopApi,
  control,
  quitDesktop,
  evaluate as evaluateNative,
  measureNativeCors,
  measureNativeStream,
} from "./host";

const presentation = nativePresentation(process.env);
async function evaluate(script: string): Promise<unknown> {
  // Native WebView startup/activation can lose an early diagnostic request.
  // Smoke actions operate only on isolated acceptance data.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await evaluateNative(script);
    } catch (error) {
      if (attempt === 2) throw error;
      await Bun.sleep(100);
    }
  }
  throw new Error("Renderer bridge is unavailable");
}
async function waitFor(check: () => Promise<boolean> | boolean, message: string, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      /* Renderer and engine can still be starting. */
    }
    await Bun.sleep(100);
  }
  throw new Error(message);
}
async function navigate(path: string) {
  // MyGo packages the SPA at one path. TanStack reads the logical route from the hash.
  await evaluate(`location.hash=${JSON.stringify(path)};return true;`);
}
async function openSettings() {
  const page = await evaluate('return location.hash.slice(1).split("#")[0]||"/"');
  assert.equal(
    await evaluate(`
      const main=document.querySelector("#main");
      if(!main)return false;
      main.setAttribute("data-native-smoke-settings-main","");
      location.hash=(location.hash.slice(1).split("#")[0]||"/")+"#settings";
      return true;
    `),
    true,
    "Settings requires a mounted workspace",
  );
  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          'return location.hash.slice(1).split("#")[1]==="settings"&&Boolean(document.querySelector("[role=dialog] [data-slot=radio-group-item]"))',
        ),
      ),
    "Settings dialog did not mount",
  );
  assert.equal(
    await evaluate('return location.hash.slice(1).split("#")[0]||"/"'),
    page,
    "Settings replaced the current page URL",
  );
  assert.equal(
    await evaluate(
      'const main=document.querySelector("#main[data-native-smoke-settings-main]");main?.removeAttribute("data-native-smoke-settings-main");return Boolean(main);',
    ),
    true,
    "Settings replaced the underlying page",
  );
}
let stage = "renderer startup";
async function assertQuiet() {
  if (!presentation.activate)
    assert.equal(
      (await nativeWindow.state()).activations,
      0,
      `Quiet smoke activated the native application during ${stage}`,
    );
}
let fixtureSession: unknown = null;
const fixturePhase = process.env.RAYPX_NATIVE_SMOKE_PHASE ?? "shell";
const dataDir = process.env.RAYPX_NATIVE_SMOKE_DATA_DIR;
if (!dataDir) throw new Error("Smoke requires an isolated data directory");
const fixtureApi = new URL(apiOrigin);
const restoredServer = process.env.RAYPX_NATIVE_SMOKE_RESTORED_SERVER === "true";
// The profile is bound to the shell server; another server must show the origin gate.
const otherServer = fixturePhase === "restore" && !restoredServer;
const fixtureUser = "native-shell-fixture";
// Guests get a direct sign-in action; only an existing account has the account menu.
const signedOutWorkspace = `Boolean(document.querySelector("#main"))&&!document.querySelector("#auth-email")&&!document.querySelector("[data-slot=dropdown-menu-trigger]")&&[...document.querySelectorAll("button[aria-label]")].some(node=>${JSON.stringify([messages.en.common.signIn, messages.zh.common.signIn])}.includes(node.getAttribute("aria-label")))`;
const instances = instanceFixture(fixtureApi.origin, fixtureUser);
if (
  (fixturePhase === "shell" || fixturePhase === "restore") &&
  (fixtureApi.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(fixtureApi.hostname))
)
  throw new Error("Synthetic shell acceptance requires a loopback API build");
const fixtureServer =
  fixturePhase === "shell" || fixturePhase === "restore"
    ? Bun.serve({
        hostname: fixtureApi.hostname,
        port: Number(fixtureApi.port),
        fetch: (request) => {
          if (new URL(request.url).pathname.startsWith("/rpc/instances/"))
            return instances(request);
          if (new URL(request.url).pathname === "/api/auth/list-sessions")
            return Response.json({
              sessionCookiePresent: (request.headers.get("cookie") ?? "").includes(
                "better-auth.session_token=raypx-native-server",
              ),
            });
          return new URL(request.url).pathname === "/api/auth/get-session"
            ? Response.json(
                fixtureSession,
                fixtureSession
                  ? {
                      headers: {
                        "set-cookie":
                          "better-auth.session_token=raypx-native-server; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
                      },
                    }
                  : undefined,
              )
            : new Response(null, { status: 503 });
        },
      })
    : undefined;

async function localSessionFixture() {
  // The shell smoke isolates native local tools from account infrastructure.
  // Real packaged-origin authentication remains in the explicit write/read phases.
  fixtureSession = null;
  await evaluate('document.dispatchEvent(new Event("visibilitychange"));return true;');
  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          `document.dispatchEvent(new Event("visibilitychange"));return ${signedOutWorkspace}`,
        ),
      ),
    "Signed-out Desktop did not open the local workspace",
  );
  const createdAt = new Date().toISOString();
  const user = {
    id: fixtureUser,
    name: "Native Smoke",
    email: "native-smoke@example.test",
    emailVerified: true,
    createdAt,
    updatedAt: createdAt,
  };
  fixtureSession = {
    user,
    session: {
      id: "native-shell-session",
      userId: user.id,
      token: "synthetic-smoke-only",
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
  };
  const response = await desktopApi.request({
    path: "/api/auth/get-session",
    method: "GET",
    headers: {},
  });
  assert.equal(
    JSON.parse(response.body)?.user?.id,
    user.id,
    "Native cookie transport did not return the synthetic session",
  );
  // Reset the auth client's cached signed-out result after changing the synthetic
  // server fixture. Real sign-in invalidation is covered by the HTTPS gate.
  await reloadRenderer();
  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          'document.dispatchEvent(new Event("visibilitychange"));return Boolean(document.querySelector("[data-slot=dropdown-menu-trigger]"))',
        ),
      ),
    "Synthetic shell session did not mount the desktop workspace",
  );
  await navigate("/");
  const homeTitles = [messages.en, messages.zh].flatMap((locale) => [
    locale.localWorkspace.welcome,
    locale.files.title,
  ]);
  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          `return location.hash==="#/"&&${JSON.stringify(homeTitles)}.includes(document.querySelector("#main h1")?.textContent)`,
        ),
      ),
    "Home navigation did not settle before the tray action",
  );
}

async function reloadRenderer() {
  const previousOrigin = await evaluate("return performance.timeOrigin");
  // Start reloading after returning this bridge response so evaluation can settle.
  await evaluate("setTimeout(()=>location.reload(),0);return true;");
  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          `return performance.timeOrigin!==${JSON.stringify(previousOrigin)}&&Boolean(document.querySelector("#main"))`,
        ),
      ),
    "Renderer did not reload",
  );
}

async function selectLanguage(locale: "en" | "zh") {
  const label = locale === "en" ? "English" : "简体中文";
  assert.equal(
    await evaluate(
      'const trigger=document.querySelector(\'[role="combobox"][aria-label="Language"], [role="combobox"][aria-label="语言"]\');if(!trigger)return false;trigger.focus();trigger.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",code:"ArrowDown",bubbles:true}));return true;',
    ),
    true,
    "Language select trigger is missing",
  );
  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          `return [...document.querySelectorAll('[role="option"]')].some(option=>option.textContent.trim()===${JSON.stringify(label)})`,
        ),
      ),
    `Language option ${label} did not open`,
  );
  assert.equal(
    await evaluate(
      `const option=[...document.querySelectorAll('[role="option"]')].find(option=>option.textContent.trim()===${JSON.stringify(label)});if(!option)return false;option.dispatchEvent(new PointerEvent("pointerdown",{pointerType:"mouse",button:0,bubbles:true}));option.click();return true;`,
    ),
    true,
    `Language option ${label} is missing`,
  );
  await waitFor(
    async () => (await evaluate("return document.documentElement.lang")) === locale,
    `Language selection did not apply ${locale}`,
  );
}

try {
  const initial = await nativeWindow.state();
  assert.equal(initial.trayVisible, true, "Native tray was not created");
  if (process.platform === "darwin") {
    const bounds = initial.trayBounds;
    console.info(`Native smoke tray bounds: ${bounds.width} x ${bounds.height}`);
    assert.ok(bounds.width > 0 && bounds.width <= 36, `Tray width is too large: ${bounds.width}`);
  }
  console.info(
    "Native smoke renderer status:",
    await evaluate(
      'return JSON.stringify({ main: Boolean(document.querySelector("#main")), ready: document.readyState, nativeId: typeof window.mygo });',
    ),
  );
  // The window starts on about:blank; reloading before navigation would keep it there.
  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          'return location.href!=="about:blank"&&Boolean(document.querySelector("main"))',
        ),
      ),
    "Packaged renderer did not load",
  );
  stage = "local engine handshake";
  await waitFor(
    async () => (await engine.status()).status === "ready",
    "Bundled local engine did not become ready",
    process.platform === "win32" ? 90_000 : 45_000,
  );
  if (fixturePhase === "shell") {
    stage = "local instance enrollment";
    const begun = (await engine.request("instance.begin", { origin: apiOrigin })) as {
      registered: boolean;
    };
    if (!begun.registered)
      assert.deepEqual(await engine.request("instance.poll", {}), { status: "approved" });
    await reloadRenderer();
  }
  if (otherServer) {
    stage = "server-bound instance gate";
    const status = (await engine.request("instance.status", {})) as {
      state: string;
      binding?: { origin: string };
    };
    assert.equal(status.state, "registered");
    assert.notEqual(status.binding?.origin, apiOrigin, "Profile was rebound to another server");
    const titles = [
      messages.en.instances.registrationStatus,
      messages.zh.instances.registrationStatus,
    ];
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            `return ${JSON.stringify(titles)}.includes(document.querySelector("main h1")?.textContent)&&!document.querySelector("#main")`,
          ),
        ),
      "Another server did not show the instance origin gate",
    );
  } else
    await waitFor(
      async () =>
        // The prerendered skeleton has no #main; it appears once the shell hydrates.
        Boolean(await evaluate('return Boolean(document.querySelector("#main"))')),
      "Packaged renderer shell did not hydrate",
    );
  const info = (await engine.request("runtime.info", {})) as {
    protocolVersion: number;
    scheduler: boolean;
    runtime: string;
    builtAt: number;
    version: string;
  };
  assert.equal(info.protocolVersion, 1);
  assert.equal(info.scheduler, true);
  assert.equal(`bun@${info.runtime}`, process.env.RAYPX_NATIVE_SMOKE_BUN);
  const daemonIdentity = await smokeOwnerIdentity(dataDir);
  assert.equal(
    info.builtAt,
    daemonIdentity.builtAt,
    "GUI and independent CLI build identities differ",
  );
  assert.equal(info.version, daemonIdentity.version);
  if (fixturePhase === "shell") {
    stage = "integrated window controls";
    const chrome = `
      const style = getComputedStyle(document.documentElement);
      const left = parseFloat(style.getPropertyValue("--mygo-titlebar-inset-left")) || 0;
      const right = parseFloat(style.getPropertyValue("--mygo-titlebar-inset-right")) || 0;
    `;
    const toolbarFits = async () =>
      Boolean(
        await evaluate(`
        ${chrome}
        const toggle = document.querySelector('[data-sidebar="trigger"]');
        const toolbar = toggle?.closest("header");
        return left + right > 0 && toolbar?.getBoundingClientRect().left >= left &&
          parseFloat(getComputedStyle(toolbar).paddingRight) >= right;
      `),
      );
    await waitFor(toolbarFits, "Workspace toolbar overlapped the native controls");
    const before = await nativeWindow.state();
    await navigate("/login?returnTo=%2Ftasks");
    await waitFor(
      async () =>
        Boolean(
          await evaluate(`
          ${chrome}
          const title = document.querySelector("main #auth-title");
          const logo = document.querySelector("header [data-slot=logo]");
          if (!title || !logo) return false;
          const heading = title.getBoundingClientRect();
          const brand = logo.getBoundingClientRect();
          const header = getComputedStyle(logo.closest("header"));
          return left + right > 0 && brand.left >= left && brand.bottom <= heading.top &&
            parseFloat(header.paddingRight) >= right;
        `),
        ),
      "Login header overlapped the native controls or the form",
    );
    await navigate("/");
    await waitFor(toolbarFits, "Workspace lost its window insets after leaving login");
    const after = await nativeWindow.state();
    assert.equal(after.height, before.height, "Navigating changed the window content height");
    assert.equal(after.visible, true, "Navigating hid the window");
    console.info("Native smoke integrated window controls passed");
    stage = "daemon WebSocket throughput";
    const runtime = (await evaluate(
      "return await window.mygo.call('Desktop.Request','get_runtime',{})",
    )) as { compiledFeatures: string[] };
    assert.deepEqual(runtime.compiledFeatures, ["native-smoke"]);
    const stream = await measureNativeStream();
    console.info(`Daemon WebSocket throughput: ${JSON.stringify(stream)}`);
    assert.equal(stream.renderer.intact, true, "Daemon channel corrupted file contents");
    assert.equal(stream.renderer.count, stream.packets, "Daemon channel lost file responses");
    assert.equal(stream.renderer.bytes, stream.bytes, "Daemon channel changed file contents");
    assert.deepEqual(
      stream.events,
      { count: 8, bytes: 8 * 256 * 1024, intact: true, ordered: true },
      "Daemon event stream did not drain intact and ordered through renderer acknowledgements",
    );
    stage = "native WebView cross-origin security";
    console.info("Native smoke WebView CORS:", await measureNativeCors());
  }
  if (presentation.activate) {
    stage = "close and restore";
    await nativeWindow.close();
    await waitFor(
      async () => !(await nativeWindow.state()).visible,
      "Native close did not hide the window",
    );
    const { focuses } = await nativeWindow.state();
    await trayAction("show");
    await waitFor(
      async () => (await nativeWindow.state()).focuses > focuses,
      "Interactive smoke did not focus the native window",
    );
    assert.equal((await nativeWindow.state()).visible, true);
    stage = "native resize";
    // AppKit's programmatic resize does not enforce the minimum for user drags.
    const target = { width: 1000, height: 660 };
    await nativeWindow.resize(target.width, target.height);
    await waitFor(async () => {
      const { width, height } = await nativeWindow.state();
      return Math.abs(width - target.width) <= 1 && Math.abs(height - target.height) <= 1;
    }, "Native window did not reach the requested dimensions");
  } else
    console.info(
      "Native smoke quiet: foreground activation, native close and resize checks skipped",
    );
  let origin: unknown;
  await waitFor(async () => {
    origin = await evaluate("return location.origin");
    return typeof origin === "string";
  }, "Renderer bridge did not recover after native resize");
  console.info(`Native smoke WebView origin: ${String(origin)}`);
  const phase = process.env.RAYPX_NATIVE_SMOKE_PHASE ?? "shell";
  if (phase === "shell" || phase === "restore") {
    stage = "runtime server configuration and isolation";
    assert.equal(
      await evaluate(`return window[${JSON.stringify(CONNECTION_KEY)}]?.apiUrl`),
      apiOrigin,
    );
    assert.equal(
      await evaluate(
        'return localStorage.getItem(JSON.stringify(["raypx.desktop",window.__raypxConnection.apiUrl,"raypx-server-acceptance"]))',
      ),
      restoredServer ? "saved" : null,
      "WebView storage crossed server partitions",
    );
    // Echo the cookie presence for this exact request. A global "last request"
    // observation races the renderer's concurrent startup session checks.
    const probe: {
      attempts: number;
      responses: number;
      expectedCookie: boolean;
      status?: number;
      cookiePresent?: boolean;
      errorName?: string;
    } = { attempts: 0, responses: 0, expectedCookie: restoredServer };
    try {
      await waitFor(async () => {
        probe.attempts++;
        try {
          const response = await desktopApi.request({
            path: "/api/auth/list-sessions",
            method: "GET",
            headers: {},
          });
          probe.status = response.status;
          const result: unknown = JSON.parse(response.body);
          const present =
            result && typeof result === "object" && "sessionCookiePresent" in result
              ? result.sessionCookiePresent
              : undefined;
          if (typeof present !== "boolean") throw new Error("Invalid smoke response");
          probe.cookiePresent = present;
          probe.responses++;
          return present === restoredServer;
        } catch (error) {
          probe.errorName =
            error instanceof DOMException && error.name === "TimeoutError"
              ? "TimeoutError"
              : error instanceof SyntaxError
                ? "InvalidJson"
                : "NativeApiError";
          throw error;
        }
      }, "Native session restore probe failed; inspect the safe cookie probe diagnostic");
    } finally {
      // Synthetic acceptance data only. Never print cookie values or response bodies.
      console.info(`Native smoke cookie probe: ${JSON.stringify(probe)}`);
    }
    assert.equal(
      (await control.info("config-isolation")).enabled,
      restoredServer,
      "Remote opt-in state crossed server settings",
    );
    await evaluate(
      'localStorage.setItem(JSON.stringify(["raypx.desktop",window.__raypxConnection.apiUrl,"raypx-server-acceptance"]),"saved");return true',
    );
    await control.enable("config-isolation", true);
  }
  if (phase === "shell" || (phase === "restore" && !otherServer)) {
    stage = "device memory before login and across restart";
    if (phase === "shell") {
      const document = {
        kind: "memory",
        name: "Native smoke memory",
        category: "Acceptance",
        content: "Device-owned reference survives sign-in and restart.",
        project: null,
      };
      const created = (await engine.request("memory.create", {
        requestId: crypto.randomUUID(),
        document,
      })) as ContextDocument;
      await engine.request("memory.update", {
        id: created.id,
        revision: 1,
        document: { ...document, content: "Temporary newer version." },
      });
      const restored = (await engine.request("memory.restore", {
        id: created.id,
        revision: 2,
        version: 1,
      })) as ContextDocument;
      assert.equal(restored.revision, 3);
      assert.equal(restored.content, document.content);
      const disposable = (await engine.request("memory.create", {
        requestId: crypto.randomUUID(),
        document: { ...document, name: "Disposable smoke reference" },
      })) as ContextDocument;
      await engine.request("memory.archive", { id: disposable.id, revision: 1, archived: true });
      assert.deepEqual(await engine.request("memory.delete", { id: disposable.id, revision: 2 }), {
        deleted: true,
      });
      assert.deepEqual(await engine.request("memory.delete", { id: disposable.id, revision: 2 }), {
        deleted: true,
      });
      await assert.rejects(
        engine.request("memory.get", { id: disposable.id }),
        /CONTEXT_NOT_FOUND/,
      );
    }
    const references = (await engine.request("memory.list", {})) as ContextDocumentSummary[];
    assert.equal(references.length, 1, "Device references did not survive restart");
    assert.equal(references[0]?.revision, 3);
    await navigate("/memory");
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            'return [...document.querySelectorAll("article h2")].some(node=>node.textContent==="Native smoke memory")',
          ),
        ),
      "Signed-out renderer did not load device-owned memory through Native IPC",
    );
    if (phase === "shell" && process.platform === "darwin") {
      stage = "signed-out local terminal approvals and window lease";
      assert.equal((await engine.features()).localTerminalApprovals, true);
      const project = join(dataDir, "terminal-approvals");
      await mkdir(project, { recursive: true });
      const root = (await engine.request("roots.register", { path: project })) as RootGrant;
      await engine.request("agents.configure", { rootId: root.id, providers: ["claude"] });
      await engine.request("approvals.local.configure", {
        rootIds: [root.id],
        away: true,
        waitSeconds: 60,
      });
      const endpoint = await Bun.file(
        join(dataDir, "profiles/native-smoke/terminal-hook.json"),
      ).json();
      const hook = async () =>
        (
          await fetch("http://localhost/hook", {
            unix: endpoint.socket,
            method: "POST",
            headers: {
              authorization: `Bearer ${endpoint.token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              provider: "claude",
              input: {
                session_id: crypto.randomUUID(),
                cwd: root.path,
                hook_event_name: "PermissionRequest",
                tool_name: "Bash",
                tool_input: { command: "printf synthetic" },
              },
            }),
          })
        ).json();
      const pending = async () =>
        ((await engine.request("approvals.local.list", {})) as ObservedProjection).requests.find(
          (request) => request.status === "pending",
        );
      // Native performs the lease renewal, rather than the smoke impersonating it.
      await Bun.sleep(5500);
      const first = hook();
      await waitFor(
        async () => Boolean(await pending()),
        "Visible Native did not maintain its approval lease",
      );
      await trayAction("hide");
      assert.deepEqual(await first, { fallback: true });
      assert.deepEqual(await hook(), { fallback: true });
      await trayAction("show");
      const second = hook();
      await waitFor(
        async () => Boolean(await pending()),
        "Restored Native did not renew its approval lease",
      );
      const request = (await pending())!;
      await engine.request("approvals.local.decide", {
        decision: {
          id: request.id,
          epoch: request.epoch,
          revision: request.revision,
          receiptId: crypto.randomUUID(),
          decision: { type: "allow" },
        },
      });
      assert.notDeepEqual(await second, { fallback: true });
      await engine.request("approvals.local.configure", {
        rootIds: [],
        away: false,
        waitSeconds: 300,
      });
      await engine.request("agents.configure", { rootId: root.id, providers: [] });
      await engine.request("roots.remove", { id: root.id });
      await Bun.sleep(16_000);
      await engine.request("runtime.info", {});
      console.info(
        "Native smoke signed-out terminal approvals, visibility leases and idle IPC passed",
      );
    }
    stage = "signed-out local workspace and isolated session fixture";
    await localSessionFixture();
    await trayAction("pending");
    await waitFor(
      async () =>
        (await evaluate("return location.hash.slice(1).split(/[?#]/)[0]")) === "/approvals",
      "Tray review action did not open the approval page",
    );
  }
  if (phase === "shell") {
    assert.equal(
      await evaluate("return location.protocol"),
      process.platform === "win32" ? "http:" : "mygo:",
    );
    await assertQuiet();
    stage = "local renderer file bridge";
    const directory = join(dataDir, "authorized");
    await mkdir(directory, { recursive: true });
    const grant = (await engine.request("roots.register", { path: directory })) as RootGrant;
    await engine.request("files.write", {
      rootId: grant.id,
      path: "native-smoke.txt",
      text: "Raypx native file bridge",
      version: null,
    });
    await openSettings();
    const filesRoute = `/files?${new URLSearchParams({ rootId: grant.id })}`;
    await navigate(filesRoute);
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            'return [...document.querySelectorAll("[data-slot=file-entry]")].some(node=>node.textContent.includes("native-smoke.txt"))',
          ),
        ),
      "Renderer did not list the engine's authorized file",
    );
    await assertQuiet();
    stage = "Packaged hash route reload";
    const filesHash = `#${filesRoute}`;
    assert.equal(await evaluate("return location.hash"), filesHash);
    await reloadRenderer();
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            `return location.hash===${JSON.stringify(filesHash)}&&[...document.querySelectorAll("[data-slot=file-entry]")].some(node=>node.textContent.includes("native-smoke.txt"))`,
          ),
        ),
      "Packaged hash route did not reload the authorized file view",
    );
    await evaluate('document.querySelector("[data-slot=file-entry]")?.click(); return true');
    await waitFor(
      async () =>
        (await evaluate('return document.querySelector("#file-editor")?.value')) ===
        "Raypx native file bridge",
      "Renderer did not read the local text file",
    );
    stage = "local renderer tasks";
    const job = (await engine.request("jobs.create", {
      name: "Native smoke scan",
      cron: "0 * * * *",
      timezone: "UTC",
      enabled: false,
      action: { type: "directory.scan", rootId: grant.id, path: "" },
    })) as JobDefinition;
    assert.equal(((await engine.request("jobs.run", { id: job.id })) as JobRun).status, "success");
    await navigate("/automations");
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            'return [...document.querySelectorAll("article h2")].some(node=>node.textContent==="Native smoke scan")',
          ),
        ),
      "Renderer did not list the persisted task",
    );
    stage = "local renderer terminal";
    await navigate("/terminal");
    const advancedLabels = [messages.en.terminal.advanced, messages.zh.terminal.advanced];
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            `return location.hash.slice(1).split(/[?#]/)[0]==="/terminal"&&[...document.querySelectorAll("button")].some(node=>${JSON.stringify(advancedLabels)}.includes(node.textContent.trim()))`,
          ),
        ),
      "Terminal route did not mount",
    );
    await evaluate(
      `const trigger=[...document.querySelectorAll("button")].find(node=>${JSON.stringify(advancedLabels)}.includes(node.textContent.trim()));trigger.click();return true;`,
    );
    await waitFor(
      async () =>
        Boolean(await evaluate('return Boolean(document.querySelector("#terminal-executable"))')),
      "Terminal route did not mount",
    );
    const shell =
      process.platform === "win32"
        ? (process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe")
        : "/bin/sh";
    const args =
      process.platform === "win32"
        ? ["/d", "/c", "echo raypx-native-pty"]
        : ["-c", "printf 'raypx-native-pty\\n'"];
    await evaluate(
      `const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;for(const [selector,value] of ${JSON.stringify(
        [
          ["#terminal-executable", shell],
          ["#terminal-cwd", directory],
          ["#terminal-args", JSON.stringify(args)],
        ],
      )}){const input=document.querySelector(selector);set.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));}return true`,
    );
    await evaluate(
      'document.querySelector("#terminal-executable").form.requestSubmit();return true;',
    );
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            'return [...document.querySelectorAll("[role=status]")].some(node=>node.textContent.includes("(0)"))',
          ),
        ),
      "Renderer terminal did not complete with a successful exit",
    );
    await assertQuiet();
    stage = "open device settings";
    await openSettings();
    await assertQuiet();
    stage = "choose device theme and English";
    await evaluate('document.querySelector("[data-theme-option=dark]").click();return true');
    await selectLanguage("en");
    await assertQuiet();
    stage = "choose Simplified Chinese";
    await selectLanguage("zh");
    await assertQuiet();
    stage = "persist device preferences";
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            'return document.documentElement.dataset.theme==="dark"&&document.documentElement.lang==="zh"',
          ),
        ),
      "Theme and language controls did not update",
    );
    await waitFor(async () => {
      const file = Bun.file(join(dataDir, "preferences.json"));
      if (!(await file.exists())) return false;
      const value = await file.json();
      return value.theme === "dark" && value.locale === "zh";
    }, "Renderer did not persist preferences through the native bridge");
  } else if (otherServer) {
    console.info("Native smoke other server kept its own partition behind the instance gate");
  } else if (phase === "restore") {
    stage = "restart local state";
    const roots = (await engine.request("roots.list", {})) as RootGrant[];
    assert.equal(roots.length, 1);
    const root = roots[0]!;
    const jobs = (await engine.request("jobs.list", {})) as JobDefinition[];
    assert.equal(jobs[0]?.name, "Native smoke scan");
    await navigate(`/files?${new URLSearchParams({ rootId: root.id })}`);
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            'return [...document.querySelectorAll("[data-slot=file-entry]")].some(node=>node.textContent.includes("native-smoke.txt"))',
          ),
        ),
      "Authorized file did not survive process restart",
    );
    await openSettings();
    console.info(
      "Restart preference values:",
      String(
        await evaluate(
          `return JSON.stringify(window[${JSON.stringify(DEVICE_PREFERENCES_KEY)}])+":"+document.documentElement.dataset.theme+":"+document.documentElement.lang+":"+location.pathname+location.search+location.hash`,
        ),
      ),
    );
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            'return Boolean(document.querySelector("[data-theme-option=dark][aria-checked=true]"))&&document.documentElement.dataset.theme==="dark"&&document.documentElement.lang==="zh"',
          ),
        ),
      "Device preferences did not survive process restart",
    );
  } else if (phase === "write" || phase === "read") {
    const api = process.env.RAYPX_NATIVE_SMOKE_API;
    if (!api || new URL(api).protocol !== "https:")
      throw new Error("Packaged authentication smoke requires an HTTPS test API");
    assert.equal(
      new URL(api).origin,
      apiOrigin,
      "Runtime configuration must select the HTTPS test API",
    );
    if (phase === "write") {
      const email = process.env.RAYPX_NATIVE_SMOKE_EMAIL,
        password = process.env.RAYPX_NATIVE_SMOKE_PASSWORD;
      if (!email || !password)
        throw new Error("Authentication smoke requires synthetic test credentials");
      stage = "packaged authentication";
      const login = await desktopApi.request({
        path: "/api/auth/sign-in/email",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(login.status, 200);
      await reloadRenderer();
      await openSettings();
      await evaluate('document.querySelector("[data-theme-option=dark]").click();return true');
      await selectLanguage("en");
      await selectLanguage("zh");
      await waitFor(async () => {
        const file = Bun.file(join(dataDir, "preferences.json"));
        if (!(await file.exists())) return false;
        const value = await file.json();
        return value.theme === "dark" && value.locale === "zh";
      }, "Renderer did not persist preferences before restart");
    } else {
      stage = "restart persistence";
      assert.equal(
        await evaluate(
          `const snapshot=window[${JSON.stringify(DEVICE_PREFERENCES_KEY)}];return snapshot.status+":"+snapshot.raw.theme+":"+snapshot.raw.locale`,
        ),
        "read:dark:zh",
      );
      const session = await desktopApi.request({
        path: "/api/auth/get-session",
        method: "GET",
        headers: {},
      });
      assert.ok(
        JSON.parse(session.body)?.user?.id,
        "Account cookie did not survive native restart",
      );
      const logout = await desktopApi.request({
        path: "/api/auth/sign-out",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(logout.status, 200);
      const signedOut = await desktopApi.request({
        path: "/api/auth/get-session",
        method: "GET",
        headers: {},
      });
      assert.equal(
        JSON.parse(signedOut.body)?.user?.id ?? null,
        null,
        "Logout left an active native session",
      );
      await reloadRenderer();
      await waitFor(
        async () => Boolean(await evaluate(`return ${signedOutWorkspace}`)),
        "Logout did not preserve access to the local workspace",
      );
    }
  } else throw new Error("Unknown native smoke phase");
  await assertQuiet();
  console.info(
    `Native smoke ${phase} passed: packaged renderer, version-matched CLI, ${presentation.activate ? "tray and window lifecycle" : "quiet window visibility (foreground GUI checks skipped)"}.`,
  );
  await fixtureServer?.stop(true);
  const completeFile = process.env.RAYPX_NATIVE_SMOKE_COMPLETE_FILE;
  if (!completeFile) throw new Error("Native smoke completion marker is unavailable");
  await writeFile(completeFile, "raypx-native-smoke-complete/1\n", { flag: "wx" });
  await writeFile(
    join(dataDir, "daemon-before-quit.json"),
    JSON.stringify(await smokeOwnerIdentity(dataDir)),
    { mode: 0o600 },
  );
  await quitDesktop();
} catch (error) {
  try {
    console.error(
      "Native renderer diagnostic:",
      String(
        await evaluate(
          `return JSON.stringify({url:location.href,text:document.body.innerText.slice(0,1500),body:document.body.innerHTML.slice(0,1500)})`,
        ),
      ),
    );
  } catch {
    /* Renderer may already be gone. */
  }
  console.error(
    `Native smoke failed at ${stage}: ${error instanceof Error ? error.message : "Unknown failure"}`,
  );
  if (process.env.CI) console.error(`::error title=Native smoke stage::${stage}`);
  await fixtureServer?.stop(true);
  await quitDesktop();
  process.exitCode = 1;
}
