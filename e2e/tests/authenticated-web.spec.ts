import { expect, test, type Page } from "@playwright/test";
import { accounts, password } from "../database.js";
const apiUrl = `http://127.0.0.1:${Number(process.env.RAYPX_E2E_PORT ?? 3000) + 2}`;
async function login(page: Page, account: keyof typeof accounts) {
  const response = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
    data: { email: accounts[account].email, password },
    headers: { origin: apiUrl },
  });
  expect(response.ok()).toBe(true);
}
test("project creation refreshes the inactive Chat project picker", async ({ page }) => {
  await login(page, "member");
  await page.goto("/chat");
  const picker = page.getByRole("combobox", { name: "Ownership" });
  await expect(
    picker.getByRole("option", { name: "Member private film", exact: true }),
  ).toHaveCount(1);
  const navigation = page.getByRole("navigation", { name: "Navigation", exact: true });
  await navigation.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project title").fill("Chat picker created project");
  await page.getByLabel("Project title").press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigation.getByRole("link", { name: "Conversations", exact: true }).click();
  await expect(
    picker.getByRole("option", { name: "Chat picker created project", exact: true }),
  ).toHaveCount(1);
});
test("real login, project creation, task creation, refresh and paginated history", async ({
  page,
}) => {
  await page.goto("/login?redirect=%2Fprojects");
  await page.getByLabel("Email", { exact: true }).fill(accounts.primary.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const signedIn = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/sign-in/email"),
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await signedIn).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Project \d{3}/ })).toHaveCount(50);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(page.getByRole("link", { name: /Project \d{3}/ })).toHaveCount(2);
  await page.goBack();
  await expect(page.getByRole("link", { name: /Project \d{3}/ })).toHaveCount(50);
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project title").fill("Browser created film");
  await page.getByLabel("Project title").press("Enter");
  await page.getByRole("link", { name: /Browser created film/ }).click();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByLabel("Add a task").fill("Browser created task");
  await page.getByLabel("Add a task").press("Enter");
  await expect(page.getByText("Browser created task", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Browser created task", { exact: true })).toBeVisible();
});
test("SSR requests isolate sessions and browser account replacement hides old projects", async ({
  browser,
  baseURL,
}) => {
  const a = await browser.newContext({ baseURL: baseURL! }),
    b = await browser.newContext({ baseURL: baseURL! });
  try {
    const pa = await a.newPage(),
      pb = await b.newPage();
    await Promise.all([login(pa, "primary"), login(pb, "member")]);
    const [primaryHtml, memberHtml] = await Promise.all([
      pa.request.get(`${baseURL}/projects`).then((r) => r.text()),
      pb.request.get(`${baseURL}/projects`).then((r) => r.text()),
    ]);
    expect(primaryHtml).toMatch(/Project \d{3}/);
    expect(primaryHtml).not.toContain("Member private film");
    expect(memberHtml).toContain("Member private film");
    expect(memberHtml).not.toMatch(/Project \d{3}/);
    await pa.goto("/projects");
    await expect(pa.getByRole("link", { name: /Project \d{3}/ }).first()).toBeVisible();
    const signOut = await pa.request.post(`${apiUrl}/api/auth/sign-out`, {
      data: {},
      headers: { origin: apiUrl },
    });
    expect(signOut.ok()).toBe(true);
    await login(pa, "member");
    await pa.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
    await expect(pa.getByRole("link", { name: /Member private film/ })).toBeVisible();
    await expect(pa.getByRole("link", { name: /Project \d{3}/ })).toHaveCount(0);
  } finally {
    await a.close();
    await b.close();
  }
});
