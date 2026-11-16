import { expect, test } from "@playwright/test";
import { createApiClient } from "@raypx/client/api";

test("an open production workspace recovers after API termination with bounded requests", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const {
    RAYPX_PRODUCTION_API_PID: pid,
    RAYPX_PRODUCTION_API_ENV: serialized,
    RAYPX_PRODUCTION_API_ARTIFACT: artifact,
    TEST_DATABASE_URL: database,
  } = process.env;
  test.skip(!pid || !serialized || !artifact, "Requires owned local production smoke processes");
  if (!pid || !serialized || !artifact || !database) return;
  const db = new URL(database);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(db.hostname) ||
    !/_test(?:_[a-z0-9]+)?$/.test(db.pathname)
  )
    throw new Error("Restart acceptance requires the selected disposable database");
  const origin = (JSON.parse(process.env.RAYPX_DEPLOYMENT_ORIGINS!) as string[])[0]!;
  const environment = JSON.parse(serialized) as Record<string, string>;
  const password = crypto.randomUUID();
  const signup = await page.request.post(origin + "/api/auth/sign-up/email", {
    headers: { origin: origin },
    data: {
      name: "Restart acceptance",
      email: process.env.RAYPX_PRODUCTION_TEST_EMAIL!,
      password,
    },
  });
  expect(signup.status()).toBe(200);
  const client = createApiClient({
    baseUrl: origin,
    headers: { origin: origin },
    fetch: async (input, init) => {
      const response = await page.request.fetch(input, {
        method: init?.method ?? "POST",
        headers: Object.fromEntries(new Headers(init?.headers)),
        data: init?.body as string,
      });
      return new Response(await response.text(), {
        status: response.status(),
        headers: response.headers(),
      });
    },
  });
  const space = await client.spaces.create({ name: "Restart acceptance" });
  const saved = await client.agents.create({
    spaceId: space.space.id,
    agent: { name: "Restart acceptance", instructions: "", model: { modelId: "unavailable" } },
  });
  let replacement: ReturnType<typeof Bun.spawn> | undefined;
  const requests: string[] = [];
  let rateLimited = 0;
  try {
    await page.goto(`${origin}/agents?spaceId=${space.space.id}&agentId=${saved.agent.id}`);
    const editor = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(editor).toBeVisible();
    await editor.fill("Retain this unsent draft");
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/") || path === "/ready") requests.push(path);
    });
    page.on("response", (response) => {
      if (response.status() === 429) rateLimited++;
    });
    // The PID is supplied only by the owner of this loopback production process.
    process.kill(Number(pid), "SIGKILL");
    await expect(
      page.getByRole("heading", { name: "This deployment is being updated" }),
    ).toBeVisible({ timeout: 25_000 });
    const before = requests.length;
    await page.clock.install();
    for (let count = 0; count < 40; count++)
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      });
    await page.clock.runFor(10_000);
    const outageRequests = requests.length - before;
    expect(outageRequests).toBeLessThanOrEqual(5);
    await page.clock.resume();
    replacement = Bun.spawn([process.execPath, "--no-env-file", artifact], {
      env: environment,
      stdout: "ignore",
      stderr: "ignore",
    });
    await expect(
      page.getByRole("heading", { name: "This deployment is being updated" }),
    ).toBeHidden({ timeout: 35_000 });
    await expect(editor).toHaveValue("Retain this unsent draft");
    // Recovery includes one cold workspace bootstrap (directory, membership,
    // history, capabilities and session reads), as well as readiness probes.
    expect(requests.length).toBeLessThanOrEqual(60);
    expect(rateLimited).toBe(0);
    await test.info().attach("request-counts", {
      contentType: "application/json",
      body: JSON.stringify({
        outageRequests,
        totalRequests: requests.length,
        rateLimited,
      }),
    });
    await client.spaces.delete({ spaceId: space.space.id });
  } finally {
    replacement?.kill("SIGTERM");
    if (replacement) {
      const child = replacement;
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      await child.exited;
      clearTimeout(timer);
    }
  }
});
