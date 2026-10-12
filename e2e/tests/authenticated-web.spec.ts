import { expect, test, type Page } from "@playwright/test";
import { accounts, password } from "../database.js";
const apiUrl = `http://127.0.0.1:${Number(process.env.VOIDMIX_E2E_PORT ?? 3000) + 2}`;
async function login(page: Page, account: keyof typeof accounts) {
  const response = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
    data: { email: accounts[account].email, password },
    headers: { origin: apiUrl },
  });
  expect(response.ok()).toBe(true);
}
test("Admin batch keeps successful writes and explains a partial failure", async ({
  page,
}, info) => {
  await login(page, "admin");
  await page.goto("/admin");
  for (const name of ["Directory person 118", "Directory person 119"]) {
    await page.getByRole("checkbox", { name: `Select ${name}`, exact: true }).check();
  }
  await page.route(
    "**/rpc/admin/users/updateStatus**",
    (route) => route.fulfill({ status: 503, body: "Unavailable" }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Suspend selected", exact: true }).click();
  await expect(page.getByText("1 updated, 1 could not be changed.", { exact: true })).toBeVisible();
  const activate = page.getByRole("button", { name: /^Activate Directory person 11[89]$/ });
  await expect(activate).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Suspend Directory person 11[89]$/ })).toHaveCount(
    1,
  );
  await page.screenshot({ path: info.outputPath("admin-partial-failure.png") });
  await page.reload();
  await expect(activate).toHaveCount(1);
  await activate.click();
  await expect(page.getByRole("button", { name: /^Suspend Directory person 11[89]$/ })).toHaveCount(
    2,
  );
});
test("real login, project creation, task creation, refresh and paginated history", async ({
  page,
}) => {
  await page.goto("/login?redirect=%2Fprojects");
  await page.getByLabel("Email", { exact: true }).fill(accounts.admin.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const signedIn = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/sign-in/email"),
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await signedIn).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Admin film/ })).toHaveCount(50);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(page.getByRole("link", { name: /Admin film/ })).toHaveCount(2);
  await page.goBack();
  await expect(page.getByRole("link", { name: /Admin film/ })).toHaveCount(50);
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
    await Promise.all([login(pa, "admin"), login(pb, "member")]);
    const [adminHtml, memberHtml] = await Promise.all([
      pa.request.get(`${baseURL}/projects`).then((r) => r.text()),
      pb.request.get(`${baseURL}/projects`).then((r) => r.text()),
    ]);
    expect(adminHtml).toContain("Admin film");
    expect(adminHtml).not.toContain("Member private film");
    expect(memberHtml).toContain("Member private film");
    expect(memberHtml).not.toContain("Admin film");
    await pa.goto("/projects");
    await expect(pa.getByRole("link", { name: /Admin film/ }).first()).toBeVisible();
    const signOut = await pa.request.post(`${apiUrl}/api/auth/sign-out`, {
      data: {},
      headers: { origin: apiUrl },
    });
    expect(signOut.ok()).toBe(true);
    await login(pa, "member");
    await pa.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
    await expect(pa.getByRole("link", { name: /Member private film/ })).toBeVisible();
    await expect(pa.getByRole("link", { name: /Admin film/ })).toHaveCount(0);
  } finally {
    await a.close();
    await b.close();
  }
});
test("Admin filters query all records, clears page selection, writes real status and retries real errors", async ({
  page,
}) => {
  await login(page, "admin");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "User directory", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Select all users" }).check();
  await expect(page.getByText("50 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("50 selected", { exact: true })).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search users" })
    .pressSequentially("Directory person 000");
  await expect(page).not.toHaveURL(/cursor=/);
  await expect(page.getByText("Directory person 000", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Activate Directory person 000" }).click();
  await expect(page.getByRole("button", { name: "Suspend Directory person 000" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Suspend Directory person 000" })).toBeVisible();
  await page.route("**/rpc/admin/users/list**", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.getByRole("button", { name: "Suspended", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not be loaded");
  await expect(page.getByText("Mina Cole")).toHaveCount(0);
  await page.unroute("**/rpc/admin/users/list**");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "User directory", exact: true })).toBeVisible();
});
