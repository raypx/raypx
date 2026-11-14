import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nativePresentation } from "../../../scripts/host/presentation.js";
import { smokeOwnerIdentity } from "./owner.js";
import { engine, desktopApi, nativeWindow, apiOrigin, evaluate, quitDesktop } from "./host.js";
const directory = process.env.RAYPX_NATIVE_SMOKE_DATA_DIR;
if (!directory) throw new Error("Native smoke requires a private data directory");
const phase = process.env.RAYPX_NATIVE_SMOKE_PHASE ?? "shell";
async function waitFor(check: () => Promise<boolean>, message: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error(message);
}
async function session() {
  const response = await desktopApi.request({
    path: "/api/auth/get-session",
    method: "GET",
    headers: {},
  });
  assert.equal(response.status, 200);
  return JSON.parse(response.body) as { user: { id: string } } | null;
}
try {
  await waitFor(
    async () => (await engine.status()).status === "ready",
    "Desktop session channel did not become ready",
  );
  assert.equal(
    ((await engine.rendererRequest("runtime.info", {})) as { protocolVersion: number })
      .protocolVersion,
    1,
  );
  for (const method of ["tools.run", "agents.local.execute", "instance.begin"])
    await assert.rejects(engine.rendererRequest(method, {}));
  assert.equal(await engine.start(), true);
  await waitFor(
    async () => (await engine.status()).status === "ready",
    "Desktop rebootstrap failed",
  );
  assert.equal(await evaluate("return typeof window.__raypxSmokeRequest === 'function'"), true);
  assert.equal(
    await evaluate(
      "return await window.__raypxSmokeRequest('save_preferences',{theme:'dark',locale:'en'})",
    ),
    true,
  );
  if (phase === "write") {
    assert.equal(new URL(apiOrigin).protocol, "https:");
    const email = process.env.RAYPX_NATIVE_SMOKE_EMAIL,
      password = process.env.RAYPX_NATIVE_SMOKE_PASSWORD;
    if (!email || !password)
      throw new Error("HTTPS acceptance requires an isolated fixture account");
    const signedIn = await desktopApi.request({
      path: "/api/auth/sign-in/email",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(signedIn.status, 200);
    const identity = await session();
    assert.ok(identity?.user.id);
    await writeFile(
      join(directory, "native-session-owner.json"),
      JSON.stringify({ accountId: identity.user.id }),
      { mode: 0o600 },
    );
  } else if (phase === "read") {
    const expected = JSON.parse(
      await readFile(join(directory, "native-session-owner.json"), "utf8"),
    );
    assert.equal((await session())?.user.id, expected.accountId);
    assert.equal(
      (
        await desktopApi.request({
          path: "/api/auth/sign-out",
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
      200,
    );
    assert.equal(await session(), null);
  } else if (phase !== "shell" && phase !== "restore")
    throw new Error("Unknown native smoke phase");
  if (!nativePresentation(process.env).activate)
    assert.equal((await nativeWindow.state()).activations, 0);
  const complete = process.env.RAYPX_NATIVE_SMOKE_COMPLETE_FILE;
  if (!complete) throw new Error("Native smoke completion marker missing");
  await writeFile(complete, "raypx-native-smoke-complete/1\n", { flag: "wx" });
  await writeFile(
    join(directory, "daemon-before-quit.json"),
    JSON.stringify(await smokeOwnerIdentity(directory)),
    { mode: 0o600 },
  );
  console.info(
    `Native smoke ${phase}: Desktop session bootstrap, renderer isolation and preferences passed`,
  );
  await quitDesktop();
} catch {
  console.error(`Native smoke ${phase} failed`);
  await quitDesktop();
  process.exitCode = 1;
}
