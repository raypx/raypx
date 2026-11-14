import { expect, test } from "@playwright/test";

const base = process.env.BOOTSTRAP_E2E_WEB_URL ?? "http://127.0.0.1:56540";
const api = process.env.BOOTSTRAP_E2E_API_URL;
test.use({ trace: "off", screenshot: "off", video: "off" });
test.describe("fresh deployment bootstrap", () => {
  test.skip(!api, "Requires the exclusive fresh-deployment backend fixture");
  // Setup/reset links and passwords must never enter traces or screenshots.
  test("signs up without mail, configures and tests email, and verifies later accounts without locking out the first", async ({
    page,
    browser,
  }) => {
    await page.goto("/signup");
    await expect(
      page.getByText("This creates the deployment administrator account.", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Your name", { exact: true }).fill("Deployment Owner");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("bootstrap-browser-owner@example.test");
    await page.getByLabel("Password", { exact: true }).fill("bootstrap-browser-password-123");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/settings#setup$/);
    await expect(page.getByRole("heading", { name: "Set up your deployment" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Skip for now" })).toBeVisible();
    await page.getByRole("link", { name: "Skip for now" }).click();
    await expect(page).toHaveURL(/\/agents$/);
    await expect(
      page.getByText(
        "Your email address is unverified. You can keep using your account or verify it now.",
      ),
    ).toBeHidden();
    await page.goto("/admin/settings#setup");
    // A copied Space bearer link admits a member without mail; membership still needs acceptance.
    const memberships = await page.request.post(`${api}/rpc/spaces/list`, {
      headers: { origin: base },
      data: { json: {} },
    });
    const spaceId = (await memberships.json()).json[0].space.id;
    const issued = await page.request.post(`${api}/rpc/spaces/createInvitation`, {
      headers: { origin: base },
      data: { json: { spaceId } },
    });
    const invitation = (await issued.json()).json.token;
    const invitedContext = await browser.newContext();
    const invited = await invitedContext.newPage();
    await invited.goto(`${base}/signup#${invitation}`);
    await invited.getByLabel("Your name", { exact: true }).fill("Invited Member");
    await invited
      .getByLabel("Email address", { exact: true })
      .fill("bootstrap-browser-invited@example.test");
    await invited.getByLabel("Password", { exact: true }).fill("bootstrap-browser-password-123");
    await invited.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(invited).toHaveURL(/\/agents$/);
    await invited.goto(`${base}/join#${invitation}`);
    await invited.getByRole("button", { name: "Join Space", exact: true }).click();
    await expect(invited).toHaveURL(/\/agents\?spaceId=/);
    // An administrator issues recovery through the user list; the ordinary reset UI consumes it.
    await page.goto("/admin/users");
    const row = page.getByRole("row").filter({ hasText: "bootstrap-browser-invited@example.test" });
    await row.getByRole("button", { name: "Reset link", exact: true }).click();
    await page.getByRole("button", { name: "Issue one-time reset link", exact: true }).click();
    const resetURL = await page.getByLabel("Copy now; this link is shown only once.").inputValue();
    await page.getByRole("button", { name: "Close reset link", exact: true }).click();
    try {
      await invited.goto(resetURL);
    } catch {
      throw new Error("Could not open the fixture reset page");
    }
    await invited
      .getByLabel("New password", { exact: true })
      .fill("bootstrap-browser-replacement-456");
    await invited.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(invited.getByText("Password updated. You can sign in now.")).toBeVisible();
    await invitedContext.close();
    await page.goto("/admin/settings#setup");
    await page.getByLabel("Sender", { exact: true }).fill("Raypx <mail@example.test>");
    await page.locator("#resend-key").fill("fixture-only-key");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Send test email", exact: true }).click();
    await expect(
      page.getByText("The mail service accepted the test email. Check your inbox."),
    ).toBeVisible();
    await expect
      .poll(
        async () => (await (await page.request.get(`${api}/__fixture/mail-count`)).json()).count,
      )
      .toBe(1);
    const context = await browser.newContext();
    const member = await context.newPage();
    await member.goto(`${base}/signup`);
    await member.getByLabel("Your name", { exact: true }).fill("Later Member");
    await member
      .getByLabel("Email address", { exact: true })
      .fill("bootstrap-browser-member@example.test");
    await member.getByLabel("Password", { exact: true }).fill("bootstrap-browser-password-123");
    await member.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(
      member.getByText(/Check your email|verification link|verify your email/i).first(),
    ).toBeVisible();
    expect(
      (await (await page.request.post(`${api}/__fixture/verify-latest`)).json()).verified,
    ).toBe(true);
    await member.goto(`${base}/login`);
    await member
      .getByLabel("Email address", { exact: true })
      .fill("bootstrap-browser-member@example.test");
    await member.getByLabel("Password", { exact: true }).fill("bootstrap-browser-password-123");
    await member.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(member).toHaveURL(/\/agents$/);
    await page.getByRole("link", { name: "Skip for now" }).click();
    await expect(page).toHaveURL(/\/agents$/);
    await expect(
      page.getByText(
        "Your email address is unverified. You can keep using your account or verify it now.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(
      page.getByText(
        "Your email address is unverified. You can keep using your account or verify it now.",
      ),
    ).toBeHidden();
    await context.close();
  });
});
