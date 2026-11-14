import { expect, test } from "@playwright/test";
import { ownedApi } from "../helpers/owned-api.js";
const apiUrl = process.env.CONTROL_E2E_API_URL;

export function registerTests() {
  test.use({ trace: "off", video: "off", screenshot: "off" });
  test("supplies a masked one-use protected input after approval, reloads durably and can decline", async ({
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
        await page.setViewportSize({ width: decision === "answer" ? 1280 : 375, height: 860 });
        await page.goto(`${baseURL}/agents?spaceId=${spaceId}&agentId=${agent.id}`);
        await page
          .getByRole("textbox", { name: "Message", exact: true })
          .fill("Fixture protected command");
        await page.getByRole("button", { name: "Send", exact: true }).click();
        const approval = page.locator("[data-approval-card]");
        await expect(approval).toBeVisible();
        expect(await api.protectedInputs.pending({ spaceId })).toHaveLength(0);
        await approval.getByRole("button", { name: "Approve", exact: true }).click();
        const form = page.locator("[data-protected-input]");
        await expect(form).toBeVisible();
        const [request] = await api.protectedInputs.pending({ spaceId });
        expect(request?.state).toBe("pending");
        await page.reload();
        await expect(form).toBeVisible();
        const [reloaded] = await api.protectedInputs.pending({ spaceId });
        expect(reloaded?.id).toBe(request?.id);
        const password = form.locator('input[type="password"]');
        await expect(password).toBeVisible();
        const value = `protected-browser-${crypto.randomUUID()}`;
        await password.fill(value);
        if (decision === "answer")
          await form.getByRole("button", { name: "Supply once", exact: true }).click();
        else await form.getByRole("button", { name: "Decline", exact: true }).click();
        await expect(form).toBeHidden();
        await expect
          .poll(
            async () =>
              (await api.conversations.snapshot({ spaceId, conversationId: conversation.id }))
                .runs[0]?.state,
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
        await page.reload();
        await expect(page.locator("[data-protected-input]")).toHaveCount(0);
      }
    } finally {
      await api.spaces.delete({ spaceId });
    }
  });
}
