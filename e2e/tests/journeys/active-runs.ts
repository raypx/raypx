import { expect as baseExpect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { ownedApi } from "../helpers/owned-api.js";
import { expectSurfaceAtRest, expectSurfaceControls } from "../helpers/geometry.js";
import { capture } from "../helpers/capture.js";

const timeout = 5_000;
const expect = baseExpect.configure({ timeout });
const apiUrl = process.env.CONTROL_E2E_API_URL;

export function registerTests() {
  test("recovers an old active Run, approves from Still working and jumps to its page", async ({
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
    const suffix = `${info.project.name}-${crypto.randomUUID()}`;
    const { space } = await api.spaces.create({ name: `Active work ${suffix}` });
    const spaceId = space.id;
    try {
      await api.spaces.setApprovalOverride({ spaceId, mode: "ask" });
      const { agent, conversation } = await api.agents.create({
        spaceId,
        agent: {
          name: "Inventory Agent",
          instructions: "Help with inventory.",
          model: { modelId: "browser-fixture" },
        },
      });
      const selection = { spaceId, conversationId: conversation.id };
      const prompt = `Fixture file write ${suffix}`;
      await api.conversations.send({
        ...selection,
        message: { text: prompt, idempotencyKey: crypto.randomUUID() },
      });
      await expect
        .poll(async () => (await api.approvals.pending({ spaceId })).length, { timeout })
        .toBe(1);
      const seed = await page.request.post(`${apiUrl}/fixture/conversation/history`, {
        headers: { origin },
        data: { ...selection, count: 65, prefix: "Later history", append: true },
        timeout,
      });
      expect(seed.status()).toBe(200);
      await page.setViewportSize({ width: 1440, height: 860 });
      await page.goto(`${baseURL}/agents?spaceId=${spaceId}&agentId=${agent.id}`, { timeout });
      await page.reload({ timeout });
      const strip = page.getByRole("region", { name: "Still working", exact: true });
      await expectSurfaceAtRest(page, strip);
      await expect(strip).toContainText("Inventory Agent");
      await expect(page.getByRole("log", { name: "Conversation", exact: true })).toHaveAttribute(
        "data-history-count",
        "30",
      );
      await expect(page.getByText(prompt, { exact: true })).toHaveCount(0);
      await expect(strip.locator("[data-approval-card]")).toBeVisible();
      for (const viewport of [
        { width: 1440, height: 860 },
        { width: 375, height: 812 },
      ]) {
        await page.setViewportSize(viewport);
        await expectSurfaceControls(page, strip);
        if (info.project.name === "web")
          await capture(page, {
            path: fileURLToPath(
              new URL(
                `../../../.artifacts/active-runs-${viewport.width}x${viewport.height}.png`,
                import.meta.url,
              ),
            ),
          });
      }
      await strip.getByRole("button", { name: "Approve", exact: true }).click({ timeout });
      await expect(strip.locator("[data-approval-card]")).toHaveCount(0);
      await expect(strip).toBeVisible();
      await strip.getByRole("button", { name: "Show Run", exact: true }).click({ timeout });
      await expect(strip).toHaveCount(0);
      await expect(page.getByText(prompt, { exact: true })).toBeVisible();
      await expect(page.getByText("Fixture reply", { exact: true })).toBeVisible();
      const completed = await page.request.post(`${apiUrl}/fixture/conversation/complete`, {
        headers: { origin },
        data: { conversationId: conversation.id },
        timeout,
      });
      expect(completed.status()).toBe(204);
      await expect
        .poll(
          async () =>
            (await api.conversations.snapshot(selection)).runs.some(
              (run) => run.state === "succeeded",
            ),
          { timeout },
        )
        .toBe(true);
    } finally {
      await api.spaces.delete({ spaceId });
    }
  });
}
