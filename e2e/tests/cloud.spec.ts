import { expect, test, type Page } from "@playwright/test";
import { accounts, password } from "../database.js";
const api = `http://127.0.0.1:${Number(process.env.RAYPX_E2E_PORT ?? 3000) + 2}`;
async function login(page: Page, account: keyof typeof accounts = "member") {
  const response = await page.request.post(`${api}/api/auth/sign-in/email`, {
    data: { email: accounts[account].email, password },
    headers: { origin: api },
  });
  expect(response.ok()).toBe(true);
}
for (const width of [390, 768, 1280]) {
  test(`recorded cloud research is responsive and has real authorized tool details at ${width}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto("/chat/e2e-cloud-recorded");
    // The dev server compiles the first authenticated module graph on demand.
    await expect(page.getByRole("heading", { name: "Recorded research", exact: true })).toBeVisible(
      { timeout: 15_000 },
    );
    await expect(page.getByText("Recorded research answer [1].", { exact: true })).toBeVisible();
    if (width < 1024) await page.getByRole("tab", { name: "Execution", exact: true }).click();
    await expect(page.getByRole("link", { name: "Recorded source" })).toHaveAttribute(
      "href",
      "https://example.com/recorded-source",
    );
    await page.locator("summary").filter({ hasText: "read_source" }).click();
    await expect(page.getByRole("heading", { name: "Input", exact: true })).toBeVisible();
    await expect(page.locator("pre").filter({ hasText: /"source":\s*"recorded"/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Output", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel run", exact: true })).toHaveCount(0);
    expect(
      await page
        .locator("html")
        .evaluate((node) => node.scrollWidth <= node.ownerDocument.defaultView!.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`cloud-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}
test("current delivery acceptance completes the actual task", async ({ page }) => {
  await login(page);
  await page.goto("/tasks/e2e-cloud-task-review");
  await expect(page.getByText("Ready for review", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Accept this delivery", exact: true }).click();
  await expect(page.getByText("Delivery accepted", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Delivery accepted", { exact: true })).toBeVisible();
});
test("usage preserves unknown calls and notification preferences persist", async ({ page }) => {
  await login(page);
  await page.goto("/settings/usage");
  await expect(
    page.getByText("Some calls have unknown usage. They have not been counted as zero."),
  ).toBeVisible();
  await page.goto("/notifications");
  const email = page.getByRole("switch", { name: "Email notifications" });
  await expect(email).not.toBeChecked();
  await email.click();
  await expect(email).toBeChecked();
  await page.reload();
  await expect(email).toBeChecked();
  const notification = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: "A task needs your input", exact: true }) });
  await notification.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(notification.getByRole("button", { name: "Mark as read", exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(notification.getByRole("button", { name: "Mark as read", exact: true })).toHaveCount(
    0,
  );
});
test("SSR and browser account replacement isolate conversation content", async ({
  browser,
  baseURL,
}) => {
  const a = await browser.newContext({ baseURL: baseURL! }),
    b = await browser.newContext({ baseURL: baseURL! });
  try {
    const pa = await a.newPage(),
      pb = await b.newPage();
    await Promise.all([login(pa, "primary"), login(pb)]);
    const [primaryHtml, memberHtml] = await Promise.all([
      pa.request.get("/chat").then((r) => r.text()),
      pb.request.get("/chat").then((r) => r.text()),
    ]);
    expect(primaryHtml).toContain("Primary private research");
    expect(primaryHtml).not.toContain("Recorded research");
    expect(memberHtml).not.toContain("Primary private research");
    await pa.goto("/chat/e2e-cloud-primary-private");
    await expect(pa.getByRole("heading", { name: "Primary private research" })).toBeVisible();
    const signOut = await pa.request.post(`${api}/api/auth/sign-out`, {
      data: {},
      headers: { origin: api },
    });
    expect(signOut.ok()).toBe(true);
    await login(pa);
    await pa.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
    await expect(pa.getByRole("heading", { name: "Primary private research" })).toHaveCount(0);
    await pb.goto("/chat/e2e-cloud-primary-private");
    await expect(pb.getByRole("alert")).toBeVisible();
    await expect(pb.getByText("Primary private research")).toHaveCount(0);
  } finally {
    await a.close();
    await b.close();
  }
});
test("conversation list cursors and older history use the durable authorized pages", async ({
  page,
}) => {
  await login(page, "pilot");
  await page.goto("/chat");
  await expect(
    page.getByRole("link", { name: "Paged conversation 054", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Paged conversation 000", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Paged conversation 054", exact: true })).toHaveCount(
    0,
  );
  await page.goto("/chat/e2e-history-conversation");
  await expect(page.getByText("Historical question 000", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Load earlier messages", exact: true }).click();
  await expect(page.getByText("Historical question 000", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load earlier messages", exact: true }),
  ).toHaveCount(0);
});
