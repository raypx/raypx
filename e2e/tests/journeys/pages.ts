import { expect as baseExpect, test, type Locator } from "@playwright/test";
import { capture } from "../helpers/capture.js";
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
    async function rpc<T = { space: { id: string } }>(path: string, input: unknown): Promise<T> {
      const response = await page.request.post(`${apiUrl}/api/rpc/${path}`, {
        headers: { origin },
        timeout,
        data: { json: input },
      });
      expect(response.ok()).toBe(true);
      return ((await response.json()) as { json: T }).json;
    }
    const isolated = await rpc("spaces/create", {
      name: `Pages ${info.project.name} ${crypto.randomUUID()}`,
    });
    const spaceId = isolated.space.id;
    try {
      await page.setViewportSize(viewports[0]!);
      await page.goto(`${baseURL}/pages?spaceId=${spaceId}`, { timeout });
      await expect(page.getByRole("heading", { name: "Pages", exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^(?:New Agent|Create Agent)$/, exact: true }),
      ).toHaveCount(1);
      await expect(page.getByRole("button", { name: "New group", exact: true })).toHaveCount(1);
      const create = page.getByRole("button", { name: "New page", exact: true });
      await capture(page, { path: info.outputPath("pages-empty.png") });
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
      await capture(page, { path: info.outputPath("page-create.png") });
      await form.getByRole("button", { name: "Create", exact: true }).click({ timeout });
      await expect(form).toBeHidden();
      await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
      // The application mount decides embedding: Desktop always hands previews to Web,
      // including this compiled browser renderer. Both still edit/version/share through RPC.
      const embedded = info.project.name !== "desktop";
      const frame = page.frameLocator(`iframe[title="${title}"]`);
      const openDocument = page.getByRole("link", { name: "Open in new tab", exact: true });
      const documentUrl = embedded ? await openDocument.getAttribute("href", { timeout }) : null;
      if (embedded) {
        expect(documentUrl).toMatch(/\/api\/pages\/member\/[^/]+\/[^/?]+$/);
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
      await capture(page, { path: info.outputPath("page-viewer.png") });
      await page.getByRole("button", { name: "Edit source", exact: true }).click({ timeout });
      await enter(
        page.getByRole("textbox", { name: "Source", exact: true }),
        "# Shared fixture\n\nThe second version.",
      );
      await capture(page, { path: info.outputPath("page-editor.png") });
      await page.getByRole("button", { name: "Save version", exact: true }).click({ timeout });
      await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
      if (documentUrl) {
        await expect(openDocument).toHaveAttribute("href", documentUrl);
        const [document] = await Promise.all([
          page.waitForEvent("popup", { timeout }),
          openDocument.click({ timeout }),
        ]);
        try {
          await expect(document).toHaveURL(documentUrl);
          await expect(document.getByText("The second version.", { exact: true })).toBeVisible();
          expect(await document.evaluate(() => window.origin)).toBe("null");
        } finally {
          await document.close();
        }
      } else {
        await expect(page.locator("iframe")).toHaveCount(0);
      }
      await page.getByRole("button", { name: "Version history", exact: true }).click({ timeout });
      const history = page.getByRole("dialog", { name: "Version history", exact: true });
      await expectSurfaceAtRest(page, history);
      await capture(page, { path: info.outputPath("page-versions.png") });
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
      await expect(shown).toHaveValue(/\/api\/pages\/public\/[a-f0-9]+/);
      const publicUrl = await shown.inputValue({ timeout });
      const publicContext = await browser.newContext();
      try {
        expect(await publicContext.cookies()).toEqual([]);
        const publicPage = await publicContext.newPage();
        if (documentUrl) {
          expect((await publicPage.goto(documentUrl, { timeout }))?.status()).toBe(404);
        }
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
      // Follow server-produced activity identity live and again after bounded history reload.
      await page.setViewportSize(viewports[0]!);
      const created = await rpc<{ agent: { id: string } }>("agents/create", {
        spaceId,
        agent: {
          name: "Page writer",
          instructions: "Write fixture Pages.",
          model: { modelId: "browser-fixture" },
        },
      });
      const conversationUrl = `${baseURL}/agents?spaceId=${spaceId}&agentId=${created.agent.id}`;
      await page.goto(conversationUrl, { timeout });
      const producedTitle = `Agent Page ${crypto.randomUUID()}`;
      await page
        .getByRole("textbox", { name: "Message", exact: true })
        .fill(`Fixture Page create ${producedTitle}`, { timeout });
      await page.getByRole("button", { name: "Send", exact: true }).click({ timeout });
      const approval = page.locator("[data-approval-card]");
      await expect(approval).toBeVisible();
      await approval.getByRole("button", { name: "Approve", exact: true }).click({ timeout });
      await expect(approval).toBeHidden();
      const createdResult = page.getByRole("button", { name: "Page created Version 1" });
      await createdResult.click({ timeout });
      const result = page.getByRole("complementary", { name: producedTitle, exact: true });
      await expect(
        result.getByText("Created from the conversation.", { exact: true }),
      ).toBeVisible();
      await page.setViewportSize(viewports[1]!);
      await expectSurfaceControls(page, result);
      const composer = page.getByRole("textbox", { name: "Message", exact: true });
      await composer.fill("Draft while reading the Page", { timeout });
      await expect(result).toBeVisible();
      await expect(composer).toBeFocused();
      await composer.fill("", { timeout });
      await result.getByRole("heading", { name: producedTitle, exact: true }).focus();
      await page.keyboard.press("Escape");
      await expect(result).toBeHidden();
      await expect(createdResult).toBeFocused();
      await page.setViewportSize(viewports[0]!);
      const activity = page.locator("[data-tool-activity]");
      await activity.getByRole("button", { name: /^1 step/ }).click({ timeout });
      await expect(activity.locator('[data-tool-outcome="succeeded"]')).toBeVisible();
      await activity.getByRole("button", { name: "Create page", exact: true }).click({ timeout });
      await expect(page.getByRole("heading", { name: producedTitle, exact: true })).toBeVisible();
      const producedId = new URL(page.url()).searchParams.get("pageId");
      expect(producedId).toBeTruthy();
      if (embedded) {
        await expect(
          page
            .frameLocator(`iframe[title="${producedTitle}"]`)
            .getByText("Created from the conversation.", { exact: true }),
        ).toBeVisible();
      } else {
        await expect(page.locator("iframe")).toHaveCount(0);
        const [handoff] = await Promise.all([
          page.waitForEvent("popup", { timeout }),
          page.getByRole("button", { name: "Open in Web", exact: true }).click({ timeout }),
        ]);
        expect(new URL(handoff.url()).searchParams.get("pageId")).toBe(producedId);
        await handoff.close();
      }
      await page.goto(conversationUrl, { timeout });
      await page
        .getByRole("textbox", { name: "Message", exact: true })
        .fill(`Fixture Page update ${producedId}`, { timeout });
      await page.getByRole("button", { name: "Send", exact: true }).click({ timeout });
      await approval.getByRole("button", { name: "Approve", exact: true }).click({ timeout });
      const updatedResult = page.getByRole("button", { name: "Page updated Version 2" });
      await expect(updatedResult).toBeVisible();
      await rpc("pages/update", {
        spaceId,
        id: producedId,
        expectedVersion: 2,
        body: "# Agent Page\n\nUpdated later by the member.",
      });
      await page.reload({ timeout });
      const log = page.getByRole("log");
      await updatedResult.scrollIntoViewIfNeeded({ timeout });
      const pageLink = page.getByRole("link", { name: "View updated Page", exact: true });
      await pageLink.click({ timeout });
      await expect(result.getByText("Updated later by the member.", { exact: true })).toBeVisible();
      await expect(page).toHaveURL(conversationUrl);
      await result.getByRole("button", { name: "Close", exact: true }).click({ timeout });
      await expect(pageLink).toBeFocused();
      await updatedResult.scrollIntoViewIfNeeded({ timeout });
      const scrollTop = await log.evaluate((node) => node.scrollTop);
      expect(scrollTop).toBeGreaterThan(0);
      await updatedResult.click({ timeout });
      await expect(result.getByText("Version 1 → Version 2", { exact: true })).toBeVisible();
      await expect(result.getByText(/^-Created from the conversation\./)).toBeVisible();
      await expect(result.getByText(/^\+Updated from the conversation\./)).toBeVisible();
      await expect(result.getByText("Updated later by the member.")).toHaveCount(0);
      if (embedded) {
        const openSavedVersion = result.getByRole("link", { name: "Open in new tab", exact: true });
        const [savedVersion] = await Promise.all([
          page.waitForEvent("popup", { timeout }),
          openSavedVersion.click({ timeout }),
        ]);
        try {
          await expect(savedVersion).toHaveURL(/\?version=2$/);
          await expect(
            savedVersion.getByText("Updated from the conversation.", { exact: true }),
          ).toBeVisible();
        } finally {
          await savedVersion.close();
        }
      }
      await expectSurfaceControls(page, result);
      await capture(page, { path: info.outputPath("chat-page-changes.png") });
      await result.getByRole("tab", { name: "Preview", exact: true }).click({ timeout });
      await expect(
        result.getByText("Updated from the conversation.", { exact: true }),
      ).toBeVisible();
      await result.getByRole("button", { name: "Close", exact: true }).click({ timeout });
      await expect(result).toBeHidden();
      await expect(updatedResult).toBeFocused();
      await expect.poll(() => log.evaluate((node) => node.scrollTop)).toBe(scrollTop);
      await expect(page).toHaveURL(conversationUrl);
      await page.setViewportSize(viewports[3]!);
      await updatedResult.click({ timeout });
      const narrowResult = page.getByRole("dialog", { name: producedTitle, exact: true });
      await expect(narrowResult.getByText("Version 1 → Version 2", { exact: true })).toBeVisible();
      if (embedded)
        await expect(
          narrowResult.getByRole("link", { name: "Open in new tab", exact: true }),
        ).toBeVisible();
      await expectSurfaceControls(page, narrowResult);
      await capture(page, { path: info.outputPath("chat-page-changes-narrow.png") });
      await page.keyboard.press("Escape");
      await expect(updatedResult).toBeFocused();
      await page.setViewportSize(viewports[0]!);
      // Deletion retains the activity reference; stale links resolve to an explicit state.
      await page.goto(`${baseURL}/pages?spaceId=${spaceId}&pageId=${producedId}`, { timeout });
      await page.getByRole("button", { name: "Delete page", exact: true }).click({ timeout });
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete page", exact: true })
        .click({ timeout });
      await page.goto(conversationUrl, { timeout });
      await updatedResult.click({ timeout });
      await expect(
        page
          .getByRole("complementary", { name: "Page result" })
          .getByText("This page version is no longer available."),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await page
        .locator("[data-tool-activity]")
        .first()
        .getByRole("button", { name: /^1 step/ })
        .click({ timeout });
      await page.getByRole("button", { name: "Create page", exact: true }).click({ timeout });
      expect(new URL(page.url()).searchParams.get("pageId")).toBe(producedId);
      await expect(page.getByRole("alert")).toHaveText("This Page was deleted");

      if (embedded) {
        await page.goto(conversationUrl, { timeout });
        const htmlTitle = "HTML preview fixture";
        await page
          .getByRole("textbox", { name: "Message", exact: true })
          .fill(`Fixture HTML Page create ${htmlTitle}`, { timeout });
        await page.getByRole("button", { name: "Send", exact: true }).click({ timeout });
        await approval.getByRole("button", { name: "Approve", exact: true }).click({ timeout });
        await expect(createdResult).toHaveCount(2);
        await createdResult.last().click({ timeout });
        const htmlResult = page.getByRole("complementary", { name: htmlTitle, exact: true });
        await expect(htmlResult.getByRole("tab")).toHaveCount(0);
        const preview = htmlResult.frameLocator("iframe");
        await preview.getByRole("button", { name: "Try preview" }).click({ timeout });
        await expect(preview.getByRole("button", { name: "Clicked" })).toBeVisible();
        await htmlResult.getByRole("button", { name: "Reload preview" }).click({ timeout });
        await expect(preview.getByRole("button", { name: "Try preview" })).toBeVisible();
        const panelBox = (await htmlResult.boundingBox())!;
        const frameBox = (await htmlResult.locator("iframe").boundingBox())!;
        expect(panelBox.width - frameBox.width).toBeLessThanOrEqual(2);
        expect(panelBox.height - frameBox.height).toBeLessThan(64);
      }
    } finally {
      await rpc("spaces/delete", { spaceId });
    }
  });
}
