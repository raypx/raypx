import assert from "node:assert/strict";
import { handleTrayAction, mainWindow, quitDesktop, tray, view, windowActions } from "./main";

// This entry is selected only by the explicit native smoke build. It exercises
// the real Electrobun process and WebView, including the renderer's cloud API.
const rpc = view.rpc as unknown as {
  request: { evaluateJavascriptWithResponse(input: { script: string }): Promise<unknown> };
};
const evaluate = (script: string) => rpc.request.evaluateJavascriptWithResponse({ script });
async function waitFor(check: () => Promise<boolean> | boolean, message: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      /* WebView RPC may still be mounting. */
    }
    await Bun.sleep(100);
  }
  throw new Error(message);
}

let stage = "renderer startup";
try {
  assert.equal(tray.visible, true, "Native tray was not created");
  await waitFor(
    async () => Boolean(await evaluate('return Boolean(document.querySelector(".titlebar"))')),
    "Packaged renderer did not load",
  );
  await waitFor(
    async () =>
      Boolean(await evaluate('return Boolean(document.querySelector(".runtime-dot.ready"))')),
    "Renderer did not receive native runtime metadata",
  );
  stage = "close and restore";
  console.info(`Native smoke WebView origin: ${await evaluate("return location.origin")}`);
  mainWindow.requestClose();
  await waitFor(() => !mainWindow.isVisible(), "Native close did not hide the window");
  windowActions.show();
  assert.equal(mainWindow.isVisible(), true, "Native tray restore did not show the window");
  await evaluate('document.querySelector(".window-actions button")?.click(); return true');
  await waitFor(() => !mainWindow.isVisible(), "Renderer bridge did not hide the native window");
  windowActions.show();
  stage = "native resize";
  mainWindow.setSize(640, 480);
  await waitFor(
    () => mainWindow.getSize().width >= 800 && mainWindow.getSize().height >= 620,
    "Native minimum dimensions were not restored",
  );
  await waitFor(
    async () => Number(await evaluate("return window.innerWidth")) >= 800,
    "Persistent BrowserView did not resize with its window",
  );

  const phase = process.env.RAYPX_NATIVE_SMOKE_PHASE ?? "write";
  if (phase === "shell") {
    assert.equal(
      await evaluate("return location.protocol"),
      "views:",
      "Shell acceptance must use packaged assets",
    );
    console.info(
      "Native packaged shell passed: assets, runtime bridge, tray, close, restore and persistent view resize.",
    );
    handleTrayAction("quit");
  } else {
    const api = process.env.RAYPX_NATIVE_SMOKE_API;
    const project = process.env.RAYPX_NATIVE_SMOKE_PROJECT;
    if (!api || !project || !["127.0.0.1", "localhost"].includes(new URL(api).hostname))
      throw new Error("Native smoke requires a loopback test API and expected synthetic project");
    stage = "native authentication";
    if (phase === "write") {
      const email = process.env.RAYPX_NATIVE_SMOKE_EMAIL;
      const password = process.env.RAYPX_NATIVE_SMOKE_PASSWORD;
      if (!email || !password)
        throw new Error("Native smoke requires synthetic test account credentials");
      const authenticated = await evaluate(`return (async () => {
      const result = await fetch(${JSON.stringify(api + "/api/auth/sign-in/email")}, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify(${JSON.stringify({ email, password })})
      });
      return result.ok;
    })()`);
      assert.equal(authenticated, true, "Native WebView authentication failed");
      stage = "authenticated project loading";
      console.info("Native smoke sign-in request accepted.");
      await evaluate('window.dispatchEvent(new Event("focus")); return true');
      await waitFor(
        async () =>
          Boolean(
            await evaluate(
              `return [...document.querySelectorAll(".project-list h2")].some(node => node.textContent === ${JSON.stringify(project)})`,
            ),
          ),
        "Authenticated native renderer did not read the expected project",
      );
      stage = "native preferences";
      await evaluate(
        'if (document.documentElement.lang === "zh") document.querySelector("header button[aria-label=English]")?.click(); if (document.documentElement.dataset.theme === "light") document.querySelector("header button[aria-label=Dark], header button[aria-label=深色]")?.click(); return true',
      );
      await waitFor(
        async () =>
          Boolean(
            await evaluate(
              'return document.documentElement.lang === "en" && document.documentElement.dataset.theme === "dark"',
            ),
          ),
        "Native controls did not reset the test preferences",
      );
      await evaluate(
        'document.querySelector("header button[aria-label=Light]")?.click(); document.querySelector("header button[aria-label=简体中文]")?.click(); return true',
      );
      await waitFor(
        async () =>
          Boolean(
            await evaluate(
              'return document.documentElement.lang === "zh" && document.documentElement.dataset.theme === "light"',
            ),
          ),
        "Native theme and locale controls did not update",
      );
      assert.equal(
        await evaluate(
          'return JSON.parse(localStorage.getItem("raypx.desktop.preferences")).state.theme',
        ),
        "light",
        "Native theme was not written to localStorage",
      );
      assert.equal(
        await evaluate('return localStorage.getItem("raypx_locale")'),
        "zh",
        "Native locale was not written to localStorage",
      );
    } else if (phase === "read") {
      stage = "restart preference persistence";
      console.info(
        `Native restart preferences: ${await evaluate("return JSON.stringify({locale: document.documentElement.lang, theme: document.documentElement.dataset.theme})")}`,
      );
      await waitFor(
        async () =>
          Boolean(
            await evaluate(
              'return document.documentElement.lang === "zh" && document.documentElement.dataset.theme === "light"',
            ),
          ),
        "Native theme and locale did not survive a restart",
      );
      stage = "restart session persistence";
      await waitFor(
        async () =>
          Boolean(
            await evaluate(
              `return [...document.querySelectorAll(".project-list h2")].some(node => node.textContent === ${JSON.stringify(project)})`,
            ),
          ),
        "Native account cookie did not survive a restart",
      );
    } else throw new Error("Unknown native smoke phase");
    const transport = process.env.RAYPX_NATIVE_SMOKE_VIEW_URL ? "HTTP preview" : "packaged views";
    console.info(
      `Native smoke ${phase} passed (${transport}): tray, close, restore, resize, renderer assets and authenticated projects.`,
    );
    handleTrayAction("quit");
  }
} catch {
  console.error(
    `Native smoke failed at ${stage}. Check the test API, persistent WebView and native lifecycle.`,
  );
  void quitDesktop(1);
}
