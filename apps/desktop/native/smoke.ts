import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { JobDefinition, JobRun, RootGrant } from "@raypx/contracts/local";
import {
  engine,
  handleTrayAction,
  mainWindow,
  quitDesktop,
  tray,
  view,
  windowActions,
} from "./main";

const rpc = view.rpc as unknown as {
  request: {
    evaluateJavascriptWithResponse(
      input: { script: string },
      options?: { maxRequestTime: number },
    ): Promise<unknown>;
  };
};
async function evaluate(script: string): Promise<unknown> {
  // Native WebView startup/activation can lose an early diagnostic request.
  // Smoke actions operate only on isolated acceptance data.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await rpc.request.evaluateJavascriptWithResponse({ script }, { maxRequestTime: 5000 });
    } catch (error) {
      if (attempt === 2) throw error;
      await Bun.sleep(100);
    }
  }
  throw new Error("Renderer bridge is unavailable");
}
async function waitFor(check: () => Promise<boolean> | boolean, message: string) {
  const deadline = Date.now() + 30_000;
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
let stage = "renderer startup";
try {
  assert.equal(tray.visible, true, "Native tray was not created");
  await waitFor(
    async () =>
      Boolean(await evaluate('return Boolean(document.querySelector("#root")?.textContent)')),
    "Packaged renderer did not load",
  );
  stage = "local engine handshake";
  await waitFor(
    () => engine.status.status === "ready",
    "Bundled local engine did not become ready",
  );
  const info = (await engine.request("runtime.info", {})) as {
    protocolVersion: number;
    scheduler: boolean;
    runtime: string;
  };
  assert.equal(info.protocolVersion, 1);
  assert.equal(info.scheduler, true);
  assert.equal(info.runtime, "1.4.3");
  stage = "close and restore";
  mainWindow.requestClose();
  await waitFor(() => !mainWindow.isVisible(), "Native close did not hide the window");
  windowActions.show();
  assert.equal(mainWindow.isVisible(), true);
  stage = "native resize";
  mainWindow.setSize(640, 480);
  await waitFor(
    () => mainWindow.getSize().width >= 800 && mainWindow.getSize().height >= 620,
    "Native minimum dimensions were not restored",
  );
  let origin: unknown;
  await waitFor(async () => {
    origin = await evaluate("return location.origin");
    return typeof origin === "string";
  }, "Renderer bridge did not recover after native resize");
  console.info(`Native smoke WebView origin: ${String(origin)}`);
  const phase = process.env.RAYPX_NATIVE_SMOKE_PHASE ?? "shell";
  if (phase === "shell") {
    assert.equal(await evaluate("return location.protocol"), "views:");
    stage = "local renderer file bridge";
    const dataDir = process.env.RAYPX_NATIVE_SMOKE_DATA_DIR;
    if (!dataDir) throw new Error("Smoke requires an isolated data directory");
    const directory = join(dataDir, "authorized");
    await mkdir(directory, { recursive: true });
    const grant = (await engine.request("roots.register", { path: directory })) as RootGrant;
    await engine.request("files.write", {
      rootId: grant.id,
      path: "native-smoke.txt",
      text: "Raypx native file bridge",
      version: null,
    });
    await evaluate('location.hash="/settings";return true');
    await waitFor(
      async () =>
        Boolean(await evaluate('return Boolean(document.querySelector("input[name=theme]"))')),
      "Settings route did not mount",
    );
    await evaluate('location.hash="/";return true');
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            'return [...document.querySelectorAll(".file-name")].some(node=>node.textContent.includes("native-smoke.txt"))',
          ),
        ),
      "Renderer did not list the engine's authorized file",
    );
    await evaluate('document.querySelector(".file-name")?.click(); return true');
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
    await evaluate('location.hash="/automations"; return true');
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            'return [...document.querySelectorAll(".job-row h2")].some(node=>node.textContent==="Native smoke scan")',
          ),
        ),
      "Renderer did not list the persisted task",
    );
    stage = "local renderer terminal";
    await evaluate('location.hash="/terminal"; return true');
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
      `document.querySelector("#terminal-executable").value=${JSON.stringify(shell)};document.querySelector("#terminal-cwd").value=${JSON.stringify(directory)};document.querySelector("#terminal-args").value=${JSON.stringify(JSON.stringify(args))};document.querySelector(".terminal-form").requestSubmit();return true`,
    );
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            'return document.querySelector(".terminal-status")?.textContent.includes("(0)")',
          ),
        ),
      "Renderer terminal did not complete with a successful exit",
    );
    stage = "device preferences";
    await evaluate('location.hash="/settings";return true');
    await waitFor(
      async () =>
        Boolean(await evaluate('return Boolean(document.querySelector("input[name=theme]"))')),
      "Settings route did not mount",
    );
    await evaluate(
      'document.querySelector("input[name=theme][value=dark]").click();const select=document.querySelector(".language-select select");select.value="zh";select.dispatchEvent(new Event("change",{bubbles:true}));return true',
    );
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            'return document.documentElement.dataset.theme==="dark"&&document.documentElement.lang==="zh"',
          ),
        ),
      "Theme and language controls did not update",
    );
    assert.equal(
      await evaluate(
        'return localStorage.getItem("theme")+":"+localStorage.getItem("raypx_locale")',
      ),
      "dark:zh",
    );
    await waitFor(async () => {
      const file = Bun.file(join(dataDir, "preferences.json"));
      if (!(await file.exists())) return false;
      const value = await file.json();
      return value.theme === "dark" && value.locale === "zh";
    }, "Renderer did not persist preferences through the native bridge");
  } else if (phase === "restore") {
    stage = "restart local state";
    const roots = (await engine.request("roots.list", {})) as RootGrant[];
    assert.equal(roots.length, 1);
    const jobs = (await engine.request("jobs.list", {})) as JobDefinition[];
    assert.equal(jobs[0]?.name, "Native smoke scan");
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            'return [...document.querySelectorAll(".file-name")].some(node=>node.textContent.includes("native-smoke.txt"))',
          ),
        ),
      "Authorized file did not survive process restart",
    );
    await evaluate('location.hash="/settings";return true');
    await Bun.sleep(100);
    console.info(
      "Restart preference values:",
      String(
        await evaluate(
          'return localStorage.getItem("theme")+":"+localStorage.getItem("raypx_locale")+":"+document.documentElement.dataset.theme+":"+document.documentElement.lang+":"+location.hash',
        ),
      ),
    );
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            'return Boolean(document.querySelector("input[name=theme][value=dark]:checked"))&&document.documentElement.dataset.theme==="dark"&&document.documentElement.lang==="zh"',
          ),
        ),
      "Device preferences did not survive process restart",
    );
  } else if (phase === "write" || phase === "read") {
    const api = process.env.RAYPX_NATIVE_SMOKE_API;
    if (!api || new URL(api).protocol !== "https:")
      throw new Error("Packaged authentication smoke requires an HTTPS test API");
    if (phase === "write") {
      const email = process.env.RAYPX_NATIVE_SMOKE_EMAIL,
        password = process.env.RAYPX_NATIVE_SMOKE_PASSWORD;
      if (!email || !password)
        throw new Error("Authentication smoke requires synthetic test credentials");
      stage = "packaged authentication";
      assert.equal(
        await evaluate(
          `return (async()=>{const response=await fetch(${JSON.stringify(api + "/api/auth/sign-in/email")},{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify(${JSON.stringify({ email, password })})});return response.ok;})()`,
        ),
        true,
      );
      await evaluate('location.hash="/settings";return true');
      await waitFor(
        async () =>
          Boolean(await evaluate('return Boolean(document.querySelector("input[name=theme]"))')),
        "Settings route did not mount",
      );
      await evaluate(
        'document.querySelector("input[name=theme][value=dark]").click();const select=document.querySelector(".language-select select");select.value="zh";select.dispatchEvent(new Event("change",{bubbles:true}));return true',
      );
    } else {
      stage = "restart persistence";
      assert.equal(
        await evaluate(
          'return localStorage.getItem("theme")+":"+localStorage.getItem("raypx_locale")',
        ),
        "dark:zh",
      );
      assert.equal(
        await evaluate(
          `return (async()=>{const response=await fetch(${JSON.stringify(api + "/api/auth/get-session")},{credentials:"include"});const value=await response.json();return Boolean(value?.user?.id);})()`,
        ),
        true,
        "Account cookie did not survive native restart",
      );
      await evaluate(
        `return fetch(${JSON.stringify(api + "/api/auth/sign-out")},{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:"{}"}).then(response=>response.ok)`,
      );
      assert.equal(
        await evaluate(
          `return (async()=>{const response=await fetch(${JSON.stringify(api + "/api/auth/get-session")},{credentials:"include"});const value=await response.json();return Boolean(value?.user?.id);})()`,
        ),
        false,
        "Logout left an active native session",
      );
    }
  } else throw new Error("Unknown native smoke phase");
  console.info(
    `Native smoke ${phase} passed: packaged renderer, version-matched CLI, tray and window lifecycle.`,
  );
  handleTrayAction("quit");
} catch (error) {
  try {
    console.error(
      "Native renderer diagnostic:",
      String(
        await evaluate(
          `return JSON.stringify({url:location.href,text:document.body.innerText.slice(0,1500),root:document.querySelector("#root")?.innerHTML.slice(0,1500)})`,
        ),
      ),
    );
  } catch {
    /* Renderer may already be gone. */
  }
  console.error(
    `Native smoke failed at ${stage}: ${error instanceof Error ? error.message : "Unknown failure"}`,
  );
  void quitDesktop(1);
}
