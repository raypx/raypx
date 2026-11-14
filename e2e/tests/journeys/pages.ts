import { expect as baseExpect, test, type Locator } from "@playwright/test";
import { expectSurfaceAtRest, expectSurfaceControls } from "../helpers/geometry.js";

const timeout = 5_000;
const expect = baseExpect.configure({ timeout });
const apiUrl = process.env.CONTROL_E2E_API_URL;
const viewports = [
  { width: 1440, height: 860 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
];
async function enter(input: Locator, value: string) {
  await input.click({ timeout });
  await input.press("ControlOrMeta+a", { timeout });
  await input.pressSequentially(value, { timeout });
}
/** The public document must remain opaque even in a context with no application session. */
export function registerTests() {
  test.use({ trace: "off", screenshot: "off", video: "off" });
  test("versions, shares and revokes a sandboxed Page", async ({
    page,
    browser,
    baseURL,
  }, info) => {
    test.skip(!apiUrl, "Requires the owned backend fixture");
    if (!apiUrl || !baseURL) return;
    test.setTimeout(90_000);
    const origin = new URL(baseURL).origin;
    const signedIn = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
      headers: { origin },
      timeout,
      data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
    });
    expect(signedIn.status()).toBe(200);
    async function rpc(path: string, input: unknown) {
      const response = await page.request.post(`${apiUrl}/rpc/${path}`, {
        headers: { origin },
        timeout,
        data: { json: input },
      });
      expect(response.ok()).toBe(true);
      return ((await response.json()) as { json: { space: { id: string } } }).json;
    }
    const isolated = await rpc("spaces/create", {
      name: `Pages ${info.project.name} ${crypto.randomUUID()}`,
    });
    const spaceId = isolated.space.id;
    try {
      await page.setViewportSize(viewports[0]!);
      await page.goto(`${baseURL}/pages?spaceId=${spaceId}`, { timeout });
      await expect(page.getByRole("heading", { name: "Pages", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "New Agent", exact: true })).toHaveCount(1);
      await expect(page.getByRole("button", { name: "New group", exact: true })).toHaveCount(1);
      const create = page.getByRole("button", { name: "New page", exact: true });
      await create.click({ timeout });
      const form = page.getByRole("dialog", { name: "New page", exact: true });
      await expectSurfaceAtRest(page, form);
      const title = `Fixture Page ${crypto.randomUUID()}`;
      const original = "# Shared fixture\n\nThe first version.";
      await enter(form.getByRole("textbox", { name: "Title", exact: true }), title);
      await enter(form.getByRole("textbox", { name: "Source", exact: true }), original);
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await expectSurfaceControls(page, form);
      }
      await form.getByRole("button", { name: "Create", exact: true }).click({ timeout });
      await expect(form).toBeHidden();
      await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
      // The application mount decides embedding: Desktop always hands previews to Web,
      // including this compiled browser renderer. Both still edit/version/share through RPC.
      const embedded = info.project.name !== "desktop";
      const frame = page.frameLocator(`iframe[title="${title}"]`);
      if (embedded) {
        await expect(
          frame.getByRole("heading", { name: "Shared fixture", exact: true }),
        ).toBeVisible();
        expect(
          await page.locator(`iframe[title="${title}"]`).getAttribute("sandbox"),
        ).not.toContain("allow-same-origin");
      } else {
        await expect(page.locator("iframe")).toHaveCount(0);
        await expect(
          page.getByText("Open this page in Web to preview it.", { exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("button", { name: "Open in Web", exact: true })).toBeVisible();
        const fullScreen = page.getByRole("button", { name: "Full screen", exact: true });
        await fullScreen.click({ timeout });
        const preview = page.getByRole("dialog", { name: title, exact: true });
        await expectSurfaceAtRest(page, preview);
        await expect(page.locator("iframe")).toHaveCount(0);
        await expect(
          preview.getByRole("button", { name: "Open in Web", exact: true }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(preview).toBeHidden();
        await expect(fullScreen).toBeFocused();
      }
      await page.getByRole("button", { name: "Edit source", exact: true }).click({ timeout });
      await enter(
        page.getByRole("textbox", { name: "Source", exact: true }),
        "# Shared fixture\n\nThe second version.",
      );
      await page.getByRole("button", { name: "Save version", exact: true }).click({ timeout });
      await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
      if (!embedded) await expect(page.locator("iframe")).toHaveCount(0);
      await page.getByRole("button", { name: "Version history", exact: true }).click({ timeout });
      const history = page.getByRole("dialog", { name: "Version history", exact: true });
      await expectSurfaceAtRest(page, history);
      const first = history
        .getByRole("listitem")
        .filter({ has: page.getByText("Version 1 · Created", { exact: true }) });
      await first
        .getByRole("button", { name: "Preview · Version 1", exact: true })
        .click({ timeout });
      if (embedded) {
        await expect(
          history
            .frameLocator(`iframe[title="${title} · Version 1"]`)
            .getByText("The first version.", { exact: true }),
        ).toBeVisible();
      } else {
        await expect(page.locator("iframe")).toHaveCount(0);
        await expect(
          history.getByRole("button", { name: "Open in Web", exact: true }),
        ).toBeVisible();
      }
      await first.getByRole("button", { name: "Restore", exact: true }).click({ timeout });
      const restore = page.getByRole("alertdialog", { name: "Restore this version?", exact: true });
      await expectSurfaceAtRest(page, restore);
      await restore.getByRole("button", { name: "Restore", exact: true }).click({ timeout });
      await expect(history).toBeHidden();
      await expect(page.getByText("Version 3", { exact: true })).toBeVisible();
      if (embedded) {
        await expect(frame.getByText("The first version.", { exact: true })).toBeVisible();
      } else {
        await expect(page.locator("iframe")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Open in Web", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Edit source", exact: true }).click({ timeout });
        await expect(page.getByRole("textbox", { name: "Source", exact: true })).toHaveValue(
          original,
        );
        await page.getByRole("button", { name: "Cancel", exact: true }).click({ timeout });
      }
      const shareButton = page.getByRole("button", { name: "Share", exact: true });
      await shareButton.click({ timeout });
      const sharing = page.getByRole("dialog", { name: "Share", exact: true });
      await expectSurfaceAtRest(page, sharing);
      await sharing.getByRole("button", { name: "Create link", exact: true }).click({ timeout });
      const shown = sharing.getByRole("textbox", { name: "Share", exact: true });
      await expect(shown).toHaveValue(/\/page-content\/public\/[a-f0-9]+/);
      const publicUrl = await shown.inputValue({ timeout });
      const publicContext = await browser.newContext();
      try {
        expect(await publicContext.cookies()).toEqual([]);
        const publicPage = await publicContext.newPage();
        const response = await publicPage.goto(publicUrl, { timeout });
        expect(response?.status()).toBe(200);
        expect(response?.headers()["cache-control"]).toContain("no-store");
        expect(response?.headers()["set-cookie"]).toBeUndefined();
        await expect(
          publicPage.getByRole("heading", { name: "Shared fixture", exact: true }),
        ).toBeVisible();
        const isolation = await publicPage.evaluate(() => {
          let cookiesDenied = false,
            storageDenied = false;
          try {
            void document.cookie;
          } catch {
            cookiesDenied = true;
          }
          try {
            void localStorage.length;
          } catch {
            storageDenied = true;
          }
          return { cookiesDenied, storageDenied, origin: window.origin };
        });
        expect(isolation).toEqual({ cookiesDenied: true, storageDenied: true, origin: "null" });
        await page.keyboard.press("Escape");
        await expect(sharing).toBeHidden();
        await expect(shareButton).toBeFocused();
        await shareButton.click({ timeout });
        await expectSurfaceAtRest(page, sharing);
        await expect(sharing.getByRole("textbox", { name: "Share", exact: true })).toHaveCount(0);
        await sharing.getByRole("button", { name: "Revoke all", exact: true }).click({ timeout });
        await expect(sharing.getByText("Revoked", { exact: true })).toBeVisible();
        const revoked = await publicPage.reload({ timeout });
        expect(revoked?.status()).toBe(404);
        await expect(publicPage.getByText("Not found", { exact: true })).toBeVisible();
      } finally {
        await publicContext.close();
      }
    } finally {
      await rpc("spaces/delete", { spaceId });
    }
  });
}
