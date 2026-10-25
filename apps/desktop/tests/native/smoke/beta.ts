import { createEvaluator } from "./evaluate";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { messages } from "@raypx/i18n/messages";
import type { RootGrant } from "@raypx/contracts/local";
import {
  control,
  apiOrigin,
  desktopApi,
  engine,
  handleTrayAction,
  mainWindow,
  quitDesktop,
  view,
} from "../../../native/main";

const suppliedDirectory = process.env.RAYPX_NATIVE_SMOKE_DATA_DIR;
const api = process.env.RAYPX_NATIVE_SMOKE_API;
const credentialsPath = process.env.RAYPX_NATIVE_SMOKE_CREDENTIALS;
if (
  process.env.RAYPX_LIVE_AGENTS !== "1" ||
  !suppliedDirectory ||
  !credentialsPath ||
  !api ||
  new URL(api).protocol !== "https:"
)
  throw new Error(
    "Beta native acceptance requires explicit live inference, an isolated directory, HTTPS API and test credentials file",
  );
const directory = suppliedDirectory;
assert.equal(
  apiOrigin,
  new URL(api).origin,
  "Runtime TOML must select the HTTPS acceptance server",
);
const credentials = (await Bun.file(credentialsPath).json()) as {
  email: string;
  password: string;
  userId: string;
};
assert.match(credentials.email, /@raypx\.example\.test$/, "Use a dedicated acceptance account");
const evaluate = createEvaluator(view);
async function waitFor(check: () => Promise<boolean> | boolean, label: string, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      /* Native startup/navigation may replace the bridge. */
    }
    await Bun.sleep(200);
  }
  throw new Error(`Beta native acceptance timed out: ${label}`);
}
let stage = "native startup";
const restoring = process.env.RAYPX_NATIVE_SMOKE_PHASE === "beta-restore";
const apiTrace: { path: string; status: number }[] = [];
const originalApiRequest = desktopApi.request;
desktopApi.request = async (input) => {
  const result = await originalApiRequest(input);
  apiTrace.push({ path: input.path.split("?")[0]!, status: result.status });
  return result;
};
async function acceptance() {
  handleTrayAction("show");
  await waitFor(() => engine.status.status === "ready", "standalone CLI startup");
  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          'return Boolean(document.querySelector("#auth-email"))||Boolean(document.querySelector("[data-slot=dropdown-menu-trigger]"))',
        ),
      ),
    "real session gate",
  );
  assert.equal(await evaluate("return location.protocol"), "views:");
  if (restoring) {
    stage = "native process restart persistence and logout";
    assert.equal(
      await evaluate('return Boolean(document.querySelector("#auth-email"))'),
      false,
      "Real session did not survive native process restart",
    );
    const session = await desktopApi.request({
      path: "/api/auth/get-session",
      method: "GET",
      headers: {},
    });
    assert.equal(JSON.parse(session.body)?.user?.id, credentials.userId);
    await waitFor(
      async () => (await control.info(credentials.userId)).connected,
      "native relay reconnect after process restart",
      60_000,
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
    assert.equal(JSON.parse(signedOut.body)?.user?.id ?? null, null);
    view.loadURL("views://main/index.html");
    await waitFor(
      async () => Boolean(await evaluate('return Boolean(document.querySelector("#auth-email"))')),
      "login page after real logout",
    );
    await waitFor(
      async () => !(await control.info(credentials.userId)).connected,
      "relay detached after logout",
    );
    await Bun.write(
      join(directory, "native-restore-complete.json"),
      JSON.stringify({
        status: "passed",
        realSessionRestart: true,
        relayReconnect: true,
        realLogout: true,
      }),
    );
    console.info(
      "Native smoke beta-restore passed: real HTTPS session survives process restart, relay reconnects, logout clears session and detaches.",
    );
    handleTrayAction("quit");
    return;
  }
  stage = "real HTTPS sign in";
  if (await evaluate('return Boolean(document.querySelector("#auth-email"))')) {
    await evaluate(
      `const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;const email=document.querySelector("#auth-email"),password=document.querySelector("#auth-password");set.call(email,${JSON.stringify(credentials.email)});email.dispatchEvent(new Event("input",{bubbles:true}));set.call(password,${JSON.stringify(credentials.password)});password.dispatchEvent(new Event("input",{bubbles:true}));return true;`,
    );
    await evaluate(
      'document.querySelector("#auth-email").closest("form").requestSubmit();return true;',
    );
  }
  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          'return Boolean(document.querySelector("[data-slot=dropdown-menu-trigger]"))',
        ),
      ),
    "native form sign in",
  );
  view.loadURL("views://main/index.html");
  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          'return Boolean(document.querySelector("[data-slot=dropdown-menu-trigger]"))',
        ),
      ),
    "authenticated native workspace",
  );
  const session = await desktopApi.request({
    path: "/api/auth/get-session",
    method: "GET",
    headers: {},
  });
  assert.equal(JSON.parse(session.body)?.user?.id, credentials.userId);
  stage = "project authorization and remote grant";
  const project = join(directory, "remote-project");
  await mkdir(project, { recursive: true });
  await Bun.write(
    join(project, "AGENTS.md"),
    "Isolated Raypx live Beta acceptance. Work only here. Do not use network, skills, integrations, commit or push.\n",
  );
  const root = (await engine.request("roots.register", { path: project })) as RootGrant;
  await engine.request("agents.configure", { rootId: root.id, providers: ["claude", "codex"] });
  await evaluate('location.hash="/settings";return true;');
  const connect = messages.en.tasks.connect;
  if (!(await control.info(credentials.userId)).enabled) {
    await waitFor(
      async () =>
        Boolean(
          await evaluate(
            `return [...document.querySelectorAll("button")].some(button=>button.textContent.trim()===${JSON.stringify(connect)}&&!button.disabled);`,
          ),
        ),
      "remote connection control",
    );
    await evaluate(
      `const button=[...document.querySelectorAll("button")].find(button=>button.textContent.trim()===${JSON.stringify(connect)});button.click();return true;`,
    );
  }
  await waitFor(
    async () => (await control.info(credentials.userId)).connected,
    "HTTPS grant and native relay connection",
    60_000,
  );
  const info = await control.info(credentials.userId);
  await Bun.write(
    join(directory, "native-ready.json"),
    JSON.stringify({
      accountId: credentials.userId,
      deviceId: info.binding?.deviceId,
      projectId: root.id,
      project,
      origin: "views://main",
      connected: true,
    }),
  );
  mainWindow.hide();
  console.info(
    "Beta native acceptance ready: real HTTPS session, project and relay connected; window hidden.",
  );
  stage = "Web tasks running on Desktop";
  let renewedDuringTask = false;
  await waitFor(
    async () => {
      if (!renewedDuringTask && (await Bun.file(join(directory, "renew-now.json")).exists())) {
        assert.equal(await control.refreshGrant(), true, "Hidden native grant renewal failed");
        await waitFor(
          async () => (await control.info(credentials.userId)).connected,
          "hidden relay reconnect after native renewal",
        );
        renewedDuringTask = true;
        await Bun.write(
          join(directory, "native-renewed.json"),
          JSON.stringify({ renewed: true, hidden: true }),
        );
      }
      return await Bun.file(join(directory, "web-complete.json")).exists();
    },
    "Web task verification",
    600_000,
  );
  const completed = (await Bun.file(join(directory, "web-complete.json")).json()) as {
    tasks: { provider: string; marker: string; file: string }[];
  };
  assert.equal(completed.tasks.length, 2);
  assert.equal(renewedDuringTask, true);
  for (const task of completed.tasks)
    assert.equal((await Bun.file(join(project, task.file)).text()).trim(), task.marker);
  stage = "Desktop renderer receives completed remote tasks";
  // WebKit may suspend a hidden view; restore it before testing renderer interaction.
  handleTrayAction("show");
  await evaluate('location.hash="/tasks";return true;');
  const remoteTab = messages.en.tasks.connectedComputers;
  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          `return [...document.querySelectorAll("button")].some(button=>button.textContent.trim()===${JSON.stringify(remoteTab)});`,
        ),
      ),
    "connected computers tab",
  );
  await evaluate(
    `const button=[...document.querySelectorAll("button")].find(button=>button.textContent.trim()===${JSON.stringify(remoteTab)});button.click();return true;`,
  );
  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          'return document.querySelector("#main")?.textContent.includes("RAYPX_BETA_CLAUDE_7319")&&document.querySelector("#main")?.textContent.includes("RAYPX_BETA_CODEX_7319");',
        ),
      ),
    "remote task rows in native renderer",
  );
  await Bun.write(
    join(directory, "native-complete.json"),
    JSON.stringify({
      status: "passed",
      origin: "views://main",
      realHttpsSession: true,
      nativeRelay: true,
      hiddenExecution: true,
      nativeRenewalDuringTask: true,
      providers: completed.tasks.map((task) => task.provider),
      renderer: true,
    }),
  );
  console.info(
    "Native smoke beta passed: Web → HTTPS relay → packaged Desktop → standalone CLI → real Claude/Codex → Web and native renderer.",
  );
  handleTrayAction("quit");
}
try {
  await acceptance();
} catch (error) {
  console.error(
    "Beta native control:",
    control.info(credentials.userId),
    "API statuses:",
    apiTrace,
  );
  try {
    console.error(
      "Beta native diagnostic:",
      await evaluate(
        `return (async()=>({location:location.href,loginForm:Boolean(document.querySelector("#auth-email")),accountMenu:Boolean(document.querySelector("[data-slot=dropdown-menu-trigger]")),heading:document.querySelector("h1,h2")?.textContent,apiRequests:performance.getEntriesByType("resource").filter(entry=>entry.name.includes("/api/auth/")).map(entry=>new URL(entry.name).origin+new URL(entry.name).pathname),session:await fetch(${JSON.stringify(api + "/api/auth/get-session")},{credentials:"include"}).then(response=>response.json()).then(value=>Boolean(value?.user?.id))}))();`,
      ),
    );
  } catch {
    /* Keep the original failure when the WebView bridge is gone. */
  }
  console.error(`Beta native acceptance failed at ${stage}:`, error);
  await Bun.write(join(directory, "native-failure.json"), JSON.stringify({ stage, failed: true }));
  await quitDesktop();
  process.exitCode = 1;
}
