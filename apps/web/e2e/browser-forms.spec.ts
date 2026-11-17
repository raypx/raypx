import { test, expect } from "@playwright/test";

const api = process.env.CONTROL_E2E_API_URL;
const site = process.env.CONTROL_E2E_BROWSER_SITE_URL;

test.use({ ignoreHTTPSErrors: true, trace: "off", screenshot: "off", video: "off" });
test("approves website typing, previews it, and lets the member submit by taking control", async ({
  page,
  request,
  baseURL,
}) => {
  test.skip(!api || !site || !baseURL, "Requires the owned browser and backend fixtures");
  if (!api || !site || !baseURL) return;
  test.setTimeout(60_000);
  const origin = new URL(baseURL).origin;
  const login = await page.request.post(`${api}/api/auth/sign-in/email`, {
    headers: { origin },
    data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
  });
  expect(login.ok()).toBe(true);
  async function rpc<T>(path: string, input: unknown): Promise<T> {
    const response = await page.request.post(`${api}/api/rpc/${path}`, {
      headers: { origin },
      data: { json: input },
    });
    expect(response.ok()).toBe(true);
    return ((await response.json()) as { json: T }).json;
  }
  const { space } = await rpc<{ space: { id: string } }>("spaces/create", {
    name: `Form ${crypto.randomUUID()}`,
  });
  async function form() {
    return (await (await request.get(new URL("/state", site).href)).json()) as {
      value: string;
      submitted: boolean;
    };
  }
  try {
    const { agent } = await rpc<{ agent: { id: string } }>("agents/create", {
      spaceId: space.id,
      agent: { name: "Form assistant", instructions: "", model: { modelId: "browser-fixture" } },
    });
    await page.setViewportSize({ width: 1440, height: 860 });
    await page.goto(`${origin}/agents?spaceId=${space.id}&agentId=${agent.id}`);
    await page.getByRole("button", { name: "Browser", exact: true }).click();
    const browser = page.getByRole("complementary", { name: "Browser", exact: true });
    await browser.getByLabel("Website URL", { exact: true }).fill(site);
    await browser.getByRole("button", { name: "Open", exact: true }).click();
    const viewport = browser.getByRole("button", { name: "Browser viewport", exact: true });
    await expect(viewport).toBeVisible({ timeout: 15_000 });
    await expect(viewport).toBeDisabled();
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Fixture browser fill");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const approval = page.locator("[data-approval-card]");
    await expect(approval.getByText("Raypx fixture", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    expect(await form()).toEqual({ value: "", submitted: false });
    await browser.getByRole("button", { name: "Take control", exact: true }).click();
    await expect(viewport).toBeEnabled();
    await browser.getByRole("button", { name: "Release control", exact: true }).click();
    await expect(viewport).toBeDisabled();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText("Browser form needs fresh approval", { exact: false })).toBeVisible(
      { timeout: 15_000 },
    );
    expect(await form()).toEqual({ value: "", submitted: false });
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Fixture browser fill");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByRole("button", { name: "Approve", exact: true }).click({ timeout: 15_000 });
    await expect
      .poll(form, { timeout: 15_000 })
      .toEqual({ value: "Raypx fixture", submitted: false });
    await browser.getByRole("button", { name: "Take control", exact: true }).click();
    await expect(viewport).toBeEnabled();
    const { width, height } = (await viewport.boundingBox())!;
    // The synthetic form's submit button covers viewport pixels 20..160 × 100..144.
    await viewport.click({ position: { x: (width * 90) / 1280, y: (height * 120) / 800 } });
    await expect.poll(form).toEqual({ value: "Raypx fixture", submitted: true });
    await browser.getByRole("button", { name: "End session", exact: true }).click();
    await expect(viewport).toHaveCount(0);
  } finally {
    await rpc("spaces/delete", { spaceId: space.id });
  }
});
