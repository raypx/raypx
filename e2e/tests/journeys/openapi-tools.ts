import { expect as baseExpect, test, type Locator } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { ownedApi } from "../helpers/owned-api.js";
import { selectOption } from "../helpers/select.js";
import { expectSurfaceAtRest, expectSurfaceControls } from "../helpers/geometry.js";
import { capture } from "../helpers/capture.js";

const timeout = 5_000;
const expect = baseExpect.configure({ timeout });
const apiUrl = process.env.CONTROL_E2E_API_URL;
async function typeText(input: Locator, value: string) {
  await input.click({ timeout });
  await input.press("ControlOrMeta+A", { timeout });
  await input.pressSequentially(value, { timeout });
}

export function registerTests() {
  test("adds Open-Meteo and keeps the local-date forecast card in chat after reload", async ({
    page,
    baseURL,
  }) => {
    test.skip(!apiUrl, "Requires the owned backend fixture");
    if (!apiUrl || !baseURL) return;
    const origin = new URL(baseURL).origin;
    const signedIn = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
      headers: { origin },
      data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
      timeout,
    });
    expect(signedIn.status()).toBe(200);
    const api = ownedApi(page, origin, apiUrl);
    const { space } = await api.spaces.create({ name: `Weather ${crypto.randomUUID()}` });
    const spaceId = space.id;
    try {
      await api.spaces.setApprovalOverride({ spaceId, mode: "ask" });
      const { agent, conversation } = await api.agents.create({
        spaceId,
        agent: {
          name: "Weather Agent",
          instructions: "Check the local forecast.",
          model: { modelId: "browser-fixture" },
        },
      });
      const url = `${baseURL}/agents?spaceId=${spaceId}&agentId=${agent.id}`;
      await page.goto(`${url}#settings/tools`, { timeout });
      const management = page.locator("[data-openapi-management]");
      await selectOption(
        page,
        management.getByRole("combobox", { name: "Space", exact: true }),
        spaceId,
        { timeout },
      );
      await management.getByRole("button", { name: "Add weather", exact: true }).click({ timeout });
      const form = page.getByRole("dialog", { name: "Add weather", exact: true });
      await expect(form.getByRole("combobox", { name: "Credentials", exact: true })).toContainText(
        "Public API (non-commercial)",
      );
      await form.getByRole("button", { name: "Save", exact: true }).click({ timeout });
      await expect(form).toBeHidden();
      await management
        .getByRole("button", { name: "Test connection", exact: true })
        .click({ timeout });
      await expect(management.getByRole("status")).toHaveText("Connected");
      await page.goto(url, { timeout });
      await page
        .getByRole("textbox", { name: "Message", exact: true })
        .fill("上海明天会下雨吗？", { timeout });
      await page.getByRole("button", { name: "Send", exact: true }).click({ timeout });
      const card = page.getByRole("article", {
        name: "Weather forecast for 上海, 中国",
        exact: true,
      });
      await expect(card).toBeVisible();
      const snapshot = () =>
        api.conversations.snapshot({ spaceId, conversationId: conversation.id });
      await expect.poll(async () => (await snapshot()).runs[0]?.state).toBe("succeeded");
      expect((await snapshot()).toolActivity?.[0]).toMatchObject({
        toolName: "weather_forecast",
        outcome: "succeeded",
        weatherForecast: { date: "2026-08-11", rain: 80 },
      });
      expect(await api.approvals.pending({ spaceId })).toEqual([]);
      await page.reload({ timeout });
      await page.setViewportSize({ width: 375, height: 812 });
      await expect(card.locator("time").first()).toHaveAttribute("datetime", "2026-08-11");
      await expect(card.getByText("29 °C", { exact: true })).toBeVisible();
      await expect(card.getByText("22 °C", { exact: true })).toBeVisible();
      await expect(card.getByText("80%", { exact: true })).toBeVisible();
      await expect(card.getByRole("link", { name: "Forecast data by Open-Meteo" })).toHaveAttribute(
        "href",
        "https://open-meteo.com/",
      );
      await card.getByRole("button", { name: "Hourly forecast", exact: true }).click({ timeout });
      const hourly = card.getByRole("table", { name: "Hourly forecast", exact: true });
      await expect(hourly.getByText("17:00", { exact: true })).toBeVisible();
      await expect(hourly.getByText("28 °C", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        375,
      );
    } finally {
      await api.spaces.delete({ spaceId });
    }
  });
  test("connects Tavily, runs both web reads and restores their sources from history", async ({
    page,
    baseURL,
  }) => {
    test.skip(!apiUrl, "Requires the owned backend fixture");
    if (!apiUrl || !baseURL) return;
    const origin = new URL(baseURL).origin;
    const signedIn = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
      headers: { origin },
      data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
      timeout,
    });
    expect(signedIn.status()).toBe(200);
    const api = ownedApi(page, origin, apiUrl);
    const { space } = await api.spaces.create({ name: `Web search ${crypto.randomUUID()}` });
    const spaceId = space.id;
    try {
      await api.spaces.setApprovalOverride({ spaceId, mode: "ask" });
      const { agent, conversation } = await api.agents.create({
        spaceId,
        agent: {
          name: "Research Agent",
          instructions: "Find sources.",
          model: { modelId: "browser-fixture" },
        },
      });
      const agentsUrl = `${baseURL}/agents?spaceId=${spaceId}&agentId=${agent.id}`;
      await page.goto(`${agentsUrl}#settings/tools`, { timeout });
      const management = page.locator("[data-openapi-management]");
      await selectOption(
        page,
        management.getByRole("combobox", { name: "Space", exact: true }),
        spaceId,
        { timeout },
      );
      await management
        .getByRole("button", { name: "Add web search", exact: true })
        .click({ timeout });
      const form = page.getByRole("dialog", { name: "Add web search", exact: true });
      await form
        .getByLabel("Secret value", { exact: true })
        .fill("fixture-tavily-key", { timeout });
      await form.getByRole("button", { name: "Save", exact: true }).click({ timeout });
      await expect(form).toBeHidden();
      await management
        .getByRole("button", { name: "Test connection", exact: true })
        .click({ timeout });
      await expect(management.getByRole("status")).toHaveText("Connected");
      await page.goto(agentsUrl, { timeout });
      await page
        .getByRole("textbox", { name: "Message", exact: true })
        .fill("Fixture web lookup", { timeout });
      await page.getByRole("button", { name: "Send", exact: true }).click({ timeout });
      const selection = { spaceId, conversationId: conversation.id };
      await expect
        .poll(async () => (await api.conversations.snapshot(selection)).runs[0]?.state, { timeout })
        .toBe("succeeded");
      const snapshot = await api.conversations.snapshot(selection);
      expect(snapshot.toolActivity?.map((call) => [call.toolName, call.outcome])).toEqual([
        ["web_search", "succeeded"],
        ["web_read", "succeeded"],
      ]);
      expect(await api.approvals.pending({ spaceId })).toEqual([]);
      expect(JSON.stringify(snapshot)).not.toContain("fixture-tavily-key");
      const card = page.getByRole("button", { name: "2 web sources", exact: true });
      const panel = page.getByRole("dialog", { name: "Web sources", exact: true });
      for (const reload of [false, true]) {
        if (reload) {
          await page.reload({ timeout });
          await page.setViewportSize({ width: 375, height: 812 });
        }
        await card.click({ timeout });
        await expectSurfaceControls(page, panel);
        await expect(panel.getByRole("link", { name: "Fixture documentation" })).toHaveAttribute(
          "href",
          "https://docs.example.com/start",
        );
        await expect(panel.getByText("Verified document excerpt.", { exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(panel).toBeHidden();
        await expect(card).toBeFocused();
        await expect(page).toHaveURL(agentsUrl);
      }
    } finally {
      await api.spaces.delete({ spaceId });
    }
  });
  test("registers an API, enables two operations and approves its mutating call", async ({
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
    const suffix = `${info.project.name}-${crypto.randomUUID()}`;
    const { space } = await api.spaces.create({ name: `HTTP tools ${suffix}` });
    const spaceId = space.id;
    const apiName = `Inventory ${suffix}`;
    try {
      await api.spaces.setApprovalOverride({ spaceId, mode: "ask" });
      const { agent, conversation } = await api.agents.create({
        spaceId,
        agent: {
          name: "Inventory Agent",
          instructions: "Use the configured inventory API when asked.",
          model: { modelId: "browser-fixture" },
        },
      });
      const agentsUrl = `${baseURL}/agents?spaceId=${spaceId}&agentId=${agent.id}`;
      await page.setViewportSize({ width: 1440, height: 860 });
      await page.goto(`${agentsUrl}#settings/tools`, { timeout });
      const management = page.locator("[data-openapi-management]");
      await expect(management).toBeVisible();
      await selectOption(
        page,
        management.getByRole("combobox", { name: "Space", exact: true }),
        spaceId,
        { timeout },
      );
      await management.getByRole("button", { name: "Add API", exact: true }).click({ timeout });
      const form = page.getByRole("dialog", { name: "Add API", exact: true });
      await expectSurfaceAtRest(page, form);
      await typeText(form.getByRole("textbox", { name: "Name", exact: true }), apiName);
      await typeText(
        form.getByRole("textbox", { name: "API server URL", exact: true }),
        `${apiUrl}/fixture/httpapi`,
      );
      await form
        .getByRole("radio", { name: "Fetch once from URL", exact: true })
        .check({ timeout });
      await typeText(
        form.getByRole("textbox", { name: "Document URL", exact: true }),
        `${apiUrl}/fixture/httpapi/schema`,
      );
      await selectOption(
        page,
        form.getByRole("combobox", { name: "Credentials", exact: true }),
        "bearer",
        { timeout },
      );
      await typeText(form.getByLabel("Secret value", { exact: true }), "fixture-api-credential");
      await form.getByRole("button", { name: "Import API", exact: true }).click({ timeout });
      const edit = page.getByRole("dialog", { name: `Edit ${apiName}`, exact: true });
      await expectSurfaceAtRest(page, edit);
      await edit.getByRole("checkbox", { name: /Read inventory item/ }).check({ timeout });
      await edit.getByRole("checkbox", { name: /Create inventory item/ }).check({ timeout });
      await expect(edit).toContainText("Read-only");
      await expect(edit).toContainText("Changes data");
      await edit.getByRole("button", { name: "Save", exact: true }).click({ timeout });
      await expect(edit).toBeHidden();
      const row = management
        .locator("[data-openapi-server]")
        .filter({ has: page.getByText(apiName, { exact: true }) });
      await row.getByRole("button", { name: "Test connection", exact: true }).click({ timeout });
      await expect(row.getByRole("status")).toHaveText("Connected");
      const server = (await api.openApiServers.list({ spaceId })).find(
        (entry) => entry.name === apiName,
      );
      expect(server?.selectedOperationIds.sort()).toEqual(["createItem", "getItem"]);
      expect(JSON.stringify(server)).not.toContain("fixture-api-credential");
      for (const viewport of [
        { width: 1440, height: 860 },
        { width: 375, height: 812 },
      ]) {
        await page.setViewportSize(viewport);
        await management.scrollIntoViewIfNeeded({ timeout });
        const settings = page.getByRole("dialog");
        await expectSurfaceAtRest(page, settings);
        await row.scrollIntoViewIfNeeded({ timeout });
        if (info.project.name === "web")
          await capture(page, {
            path: fileURLToPath(
              new URL(
                `../../../.artifacts/openapi-management-${viewport.width}x${viewport.height}.png`,
                import.meta.url,
              ),
            ),
          });
        await expectSurfaceControls(page, row);
      }
      await page.goto(agentsUrl, { timeout });
      const editor = page.getByRole("textbox", { name: "Message", exact: true });
      await typeText(editor, `Fixture API call ${suffix}`);
      await page.getByRole("button", { name: "Send", exact: true }).click({ timeout });
      const approval = page.locator("[data-approval-card]");
      await expect(approval).toBeVisible();
      await expect(approval).toContainText("POST");
      await expect(approval).toContainText("/items");
      await expect(approval).not.toContainText("fixture-api-credential");
      const pending = await api.approvals.pending({ spaceId });
      expect(pending).toHaveLength(1);
      expect(pending[0]!.toolName).toContain("__createItem");
      await approval.getByRole("button", { name: "Approve", exact: true }).click({ timeout });
      await expect(approval).toBeHidden();
      const selection = { spaceId, conversationId: conversation.id };
      await expect
        .poll(async () => (await api.conversations.snapshot(selection)).runs[0]?.state, { timeout })
        .toBe("succeeded");
      const snapshot = await api.conversations.snapshot(selection);
      const activity = snapshot.toolActivity?.filter((call) =>
        call.toolName.startsWith("openapi_"),
      );
      expect(activity?.map((call) => call.outcome)).toEqual(["succeeded", "succeeded"]);
      const effects = await api.approvals.effects({ spaceId, runId: snapshot.runs[0]!.id });
      expect(
        effects
          .filter((effect) => effect.toolName.startsWith("openapi_"))
          .map((effect) => effect.state),
      ).toEqual(["succeeded", "succeeded"]);
      expect(JSON.stringify({ snapshot, effects })).not.toContain("fixture-api-credential");
      await page
        .locator("[data-tool-activity]")
        .getByRole("button", { name: /2 steps/ })
        .click({ timeout });
      await expect(page.locator("[data-tool-call]")).toHaveCount(2);
      await page.getByRole("button", { name: "Review effects", exact: true }).click({ timeout });
      const inspector = page.getByRole("dialog");
      await expectSurfaceAtRest(page, inspector);
      await expect(inspector).toContainText("Read inventory item");
      await expect(inspector).toContainText("Create inventory item");
    } finally {
      await api.spaces.delete({ spaceId });
    }
  });
}
