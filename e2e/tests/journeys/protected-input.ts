import { expect as baseExpect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { capture } from "../helpers/capture.js";
import { expectSurfaceAtRest, expectSurfaceControls } from "../helpers/geometry.js";
import { ownedApi } from "../helpers/owned-api.js";
const timeout = 5_000;
const expect = baseExpect.configure({ timeout });
const apiUrl = process.env.CONTROL_E2E_API_URL;

/** Only pending metadata is captured, before a generated value enters the masked field. */
async function reviewPendingInput(page: Page, surface: string, width: number, height: number) {
  const form = page.locator("[data-protected-input]");
  const composer = page.locator("[data-composer-card]");
  await expect(form).toHaveCount(1);
  for (const tab of ["Activity", "Files", "Conversation"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click({ timeout });
    await expect(form).toHaveCount(1);
    await expect(form.locator('input[type="password"]')).toHaveValue("");
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEnabled();
  }
  const directory = fileURLToPath(new URL("../../../.artifacts/ui/", import.meta.url));
  await mkdir(directory, { recursive: true });
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.evaluate((value) => localStorage.setItem("theme", value), theme);
    await page.reload({ timeout });
    await expect(form).toHaveCount(1);
    await expect(form.locator('input[type="password"]')).toHaveValue("");
    await expectSurfaceControls(page, form);
    await expectSurfaceAtRest(page, composer);
    const formBox = await form.boundingBox({ timeout });
    const composerBox = await composer.boundingBox({ timeout });
    expect(formBox).not.toBeNull();
    expect(composerBox).not.toBeNull();
    expect(formBox!.y + formBox!.height).toBeLessThanOrEqual(composerBox!.y + 1);
    await capture(page, {
      path: `${directory}/${surface}-${width}x${height}-${theme}-protected-input.png`,
    });
  }
}

export function registerTests() {
  test.use({ trace: "off", video: "off", screenshot: "off" });
  test("supplies a masked one-use protected input after approval, reloads durably and can decline", async ({
    page,
    baseURL,
  }, info) => {
    test.skip(!apiUrl, "Requires the owned backend fixture");
    if (!apiUrl || !baseURL) return;
    test.setTimeout(90_000);
    const origin = new URL(baseURL).origin;
    const signedIn = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
      headers: { origin },
      data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
      timeout,
    });
    expect(signedIn.status()).toBe(200);
    const api = ownedApi(page, origin, apiUrl);
    const { space } = await api.spaces.create({
      name: `Protected ${info.project.name} ${crypto.randomUUID()}`,
    });
    const spaceId = space.id;
    try {
      await api.spaces.setApprovalOverride({ spaceId, mode: "ask" });
      for (const decision of ["answer", "decline"] as const) {
        const { agent, conversation } = await api.agents.create({
          spaceId,
          agent: {
            name: "Protected input Agent",
            instructions: "Request protected input instead of asking for secrets in chat.",
            model: { modelId: "browser-fixture" },
          },
        });
        const viewport = {
          width: decision === "answer" ? 1440 : 375,
          height: decision === "answer" ? 860 : 812,
        };
        await page.setViewportSize(viewport);
        await page.goto(`${baseURL}/agents?spaceId=${spaceId}&agentId=${agent.id}`, { timeout });
        await page
          .getByRole("textbox", { name: "Message", exact: true })
          .pressSequentially("Fixture protected command", { timeout });
        await page.getByRole("button", { name: "Send", exact: true }).click({ timeout });
        const approval = page.locator("[data-approval-card]");
        await expect(approval).toBeVisible();
        expect(await api.protectedInputs.pending({ spaceId })).toHaveLength(0);
        await approval.getByRole("button", { name: "Approve", exact: true }).click({ timeout });
        const form = page.locator("[data-protected-input]");
        await expect(form).toBeVisible();
        const [request] = await api.protectedInputs.pending({ spaceId });
        expect(request?.state).toBe("pending");
        await page.reload({ timeout });
        await expect(form).toBeVisible();
        const [reloaded] = await api.protectedInputs.pending({ spaceId });
        expect(reloaded?.id).toBe(request?.id);
        await reviewPendingInput(page, info.project.name, viewport.width, viewport.height);
        const password = form.locator('input[type="password"]');
        await expect(password).toBeVisible();
        const value = `protected-browser-${crypto.randomUUID()}`;
        await password.pressSequentially(value, { timeout });
        if (decision === "answer")
          await form.getByRole("button", { name: "Supply once", exact: true }).click({ timeout });
        else await form.getByRole("button", { name: "Decline", exact: true }).click({ timeout });
        await expect(form).toBeHidden();
        await expect
          .poll(
            async () =>
              (await api.conversations.snapshot({ spaceId, conversationId: conversation.id }))
                .runs[0]?.state,
            { timeout },
          )
          .toBe("succeeded");
        const snapshot = await api.conversations.snapshot({
          spaceId,
          conversationId: conversation.id,
        });
        const runId = snapshot.runs[0]!.id;
        const effects = await api.approvals.effects({ spaceId, runId });
        expect(effects).toHaveLength(decision === "answer" ? 1 : 0);
        const events = await api.conversations.events({
          spaceId,
          conversationId: conversation.id,
          after: 0,
        });
        expect(JSON.stringify([snapshot, effects, events]).includes(value)).toBe(false);
        const stored = await page.evaluate(() =>
          JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
        );
        expect(stored.includes(value)).toBe(false);
        expect((await page.content()).includes(value)).toBe(false);
        await page.reload({ timeout });
        await expect(page.locator("[data-protected-input]")).toHaveCount(0);
      }
    } finally {
      await api.spaces.delete({ spaceId });
    }
  });
  for (const destination of [
    "environment",
    "stdin",
    "bearer",
    "header",
    "query",
    "basic",
    "mcp",
    "device-environment",
    "device-stdin",
  ] as const) {
    test(`delivers protected ${destination} once without renderer or durable output leaks`, async ({
      page,
      baseURL,
    }, info) => {
      test.skip(!apiUrl, "Requires the owned backend fixture");
      if (!apiUrl || !baseURL) return;
      test.setTimeout(60_000);
      const origin = new URL(baseURL).origin;
      const signedIn = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
        headers: { origin },
        data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
        timeout,
      });
      expect(signedIn.status()).toBe(200);
      const api = ownedApi(page, origin, apiUrl);
      const { space } = await api.spaces.create({
        name: `Protected ${destination} ${info.project.name} ${crypto.randomUUID()}`,
      });
      const spaceId = space.id;
      let remoteId: string | undefined;
      let deviceId: string | undefined;
      try {
        // Auto's always-approve fixture cannot review these operations or supply inputs.
        await api.spaces.setApprovalOverride({ spaceId, mode: "auto" });
        const { agent, conversation } = await api.agents.create({
          spaceId,
          agent: {
            name: "Protected input",
            instructions: "Request a value only through protected input.",
            model: { modelId: "browser-fixture" },
          },
        });
        if (["bearer", "header", "query", "basic"].includes(destination)) {
          await api.openApiServers.create({
            spaceId,
            server: {
              name: "Single-call API",
              url: `${apiUrl}/fixture/httpapi`,
              selectedOperationIds: ["protectedCall"],
              availability: { mode: "all" },
            },
            source: { url: `${apiUrl}/fixture/httpapi/schema` },
          });
        } else if (destination === "mcp") {
          const server = await api.mcpServers.create({
            server: {
              name: "Single-call remote tool",
              transport: "http",
              url: `${apiUrl}/fixture/mcp`,
              perCallSecretHeader: "x-call-key",
              availability: { mode: "all" },
            },
          });
          remoteId = server.id;
          await api.mcpServers.setEnabled({ spaceId, agentId: agent.id, serverIds: [server.id] });
        } else if (destination.startsWith("device-")) {
          const pairing = await api.deviceComputers.createPairing({ spaceId });
          const paired = await page.request.post(`${apiUrl}/fixture/device/pair`, {
            headers: { origin },
            data: { code: pairing.code },
            timeout,
          });
          expect(paired.status()).toBe(200);
          deviceId = ((await paired.json()) as { deviceId: string }).deviceId;
          await api.deviceComputers.requestGrant({ spaceId, deviceId });
          await expect
            .poll(
              async () =>
                (await api.deviceComputers.list({ spaceId })).devices.find(
                  (candidate) => candidate.id === deviceId,
                )?.grants.length,
              { timeout },
            )
            .toBe(1);
          const device = (await api.deviceComputers.list({ spaceId })).devices.find(
            (candidate) => candidate.id === deviceId,
          )!;
          await api.deviceComputers.select({
            spaceId,
            conversationId: conversation.id,
            selection: { deviceId, grantId: device.grants[0]!.id },
          });
        }
        await page.setViewportSize({ width: destination === "basic" ? 375 : 1280, height: 900 });
        await page.goto(`${baseURL}/agents?spaceId=${spaceId}&agentId=${agent.id}`, { timeout });
        await page
          .getByRole("textbox", { name: "Message", exact: true })
          .fill(`Fixture protected destination ${destination}`, { timeout });
        await page.getByRole("button", { name: "Send", exact: true }).click({ timeout });
        const approval = page.locator("[data-approval-card]");
        await expect(approval).toBeVisible();
        expect(await api.protectedInputs.pending({ spaceId })).toHaveLength(0);
        await approval.getByRole("button", { name: "Approve", exact: true }).click({ timeout });
        const form = page.locator("[data-protected-input]");
        await expect(form).toBeVisible();
        const [request] = await api.protectedInputs.pending({ spaceId });
        await page.reload({ timeout });
        await expect(form).toBeVisible();
        expect((await api.protectedInputs.pending({ spaceId }))[0]?.id).toBe(request?.id);
        const value = `single-${crypto.randomUUID()} /+`;
        const username = `user-${crypto.randomUUID()}`;
        if (destination === "basic")
          await form.getByLabel("Username", { exact: true }).fill(username, { timeout });
        const field = form.locator('input[type="password"]').last();
        await field.fill(value, { timeout });
        await form.getByRole("button", { name: "Supply once", exact: true }).click({ timeout });
        await expect(form).toBeHidden();
        await expect
          .poll(
            async () =>
              (await api.conversations.snapshot({ spaceId, conversationId: conversation.id }))
                .runs[0]?.state,
            { timeout: 10_000 },
          )
          .toBe("succeeded");
        const snapshot = await api.conversations.snapshot({
          spaceId,
          conversationId: conversation.id,
        });
        const effects = await api.approvals.effects({ spaceId, runId: snapshot.runs[0]!.id });
        expect(effects).toHaveLength(1);
        expect(effects[0]?.state).toBe("succeeded");
        const events = await api.conversations.events({
          spaceId,
          conversationId: conversation.id,
          after: 0,
        });
        const storage = await page.evaluate(() =>
          JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
        );
        const surfaces = JSON.stringify([snapshot, effects, events, storage, await page.content()]);
        for (const supplied of destination === "basic"
          ? [value, username, `${username}:${value}`]
          : [value]) {
          const encodings = await page.evaluate((raw) => {
            const bytes = new TextEncoder().encode(raw);
            const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
            return [
              raw,
              base64,
              base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""),
              Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
              encodeURIComponent(raw),
            ];
          }, supplied);
          expect(encodings.some((encoded) => surfaces.includes(encoded))).toBe(false);
        }
        await page.reload({ timeout });
        await expect(form).toHaveCount(0);
      } finally {
        if (deviceId) await api.deviceComputers.revoke({ spaceId, deviceId });
        if (remoteId) await api.mcpServers.delete({ id: remoteId });
        await api.spaces.delete({ spaceId });
      }
    });
  }
}
