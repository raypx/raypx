import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { createApiClient } from "@raypx/client/api";
import { expectSurfaceControls, expectSurfaceAtRest } from "../helpers/geometry.js";

const apiUrl = process.env.CONTROL_E2E_API_URL;
function client(page: Page, baseUrl: string, origin: string) {
  return createApiClient({
    baseUrl,
    headers: { origin },
    fetch: async (input, init) => {
      const response = await page.request.fetch(input, {
        method: init?.method ?? "POST",
        headers: Object.fromEntries(new Headers(init?.headers)),
        ...(typeof init?.body === "string" ? { data: init.body } : {}),
      });
      return new Response(await response.text(), {
        status: response.status(),
        headers: response.headers(),
      });
    },
  });
}
export function registerTests() {
  test.use({
    trace: "off",
    video: "off",
    screenshot: "off",
    actionTimeout: 5000,
    navigationTimeout: 10000,
  });
  test("views the computer screen, shares exclusive control and releases keyboard focus", async ({
    page,
    browser,
    baseURL,
  }, info) => {
    test.skip(!apiUrl, "Requires the owned backend fixture");
    if (!apiUrl || !baseURL) return;
    test.setTimeout(120_000);
    const origin = new URL(baseURL).origin;
    const login = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
      headers: { origin },
      data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
    });
    expect(login.status()).toBe(200);
    const api = client(page, apiUrl, origin);
    const { space } = await api.spaces.create({
      name: `Screen ${info.project.name} ${crypto.randomUUID()}`,
    });
    const spaceId = space.id;
    const { agent } = await api.agents.create({
      spaceId,
      agent: { name: "Screen Agent", instructions: "", model: { modelId: "browser-fixture" } },
    });
    const memberContext = await browser.newContext({
      locale: "en-US",
      viewport: { width: 1440, height: 860 },
      reducedMotion: "reduce",
    });
    try {
      const member = await memberContext.newPage();
      const memberSession = await member.request.post(`${apiUrl}/api/auth/sign-in/email`, {
        headers: { origin },
        data: {
          email: `control-member-${info.project.name}@example.com`,
          password: "Raypx-control-test-123",
        },
      });
      expect(memberSession.status()).toBe(200);
      const memberApi = client(member, apiUrl, origin);
      const invitation = await api.spaces.createInvitation({ spaceId });
      await memberApi.spaces.acceptInvitation({ token: invitation.token });
      const destination = `${baseURL}/agents?spaceId=${spaceId}&agentId=${agent.id}`;
      await page.setViewportSize({ width: 1440, height: 860 });
      await page.goto(destination);
      await page.getByRole("button", { name: /^Computer:/ }).click();
      await page.getByRole("button", { name: "Start computer", exact: true }).click();
      const surface = page.getByRole("region", { name: "Screen", exact: true });
      await surface.getByRole("button", { name: "Start screen", exact: true }).click();
      const image = surface.getByRole("img", { name: "Computer screen", exact: true });
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate(
            (node: HTMLImageElement) =>
              node.complete && node.naturalWidth === 1024 && node.naturalHeight === 768,
          ),
        )
        .toBe(true);
      const first = await image.getAttribute("src");
      await surface.getByRole("button", { name: "Take control", exact: true }).click();
      const input = surface.getByRole("textbox", {
        name: "Computer screen input",
        exact: true,
      });
      await expect(input).toBeFocused();
      await input.press("a");
      await expect.poll(() => image.getAttribute("src")).not.toBe(first);
      await member.goto(destination);
      await member.getByRole("button", { name: /^Computer:/ }).click();
      const other = member.getByRole("region", { name: "Screen", exact: true });
      await expect(
        other.getByText("Controlled by Control Browser Test", { exact: true }),
      ).toBeVisible();
      await expect(other.getByRole("button", { name: "Take control", exact: true })).toBeDisabled();
      await expect(other.getByText("Agent input paused", { exact: true })).toBeVisible();
      const screenshotDirectory = fileURLToPath(
        new URL("../../../.artifacts/screen/", import.meta.url),
      );
      await mkdir(screenshotDirectory, { recursive: true });
      for (const viewport of [
        { width: 1440, height: 860 },
        { width: 375, height: 812 },
      ]) {
        await page.setViewportSize(viewport);
        const panel = page.getByRole(viewport.width >= 1280 ? "complementary" : "dialog", {
          name: "Team computer",
          exact: true,
        });
        await expectSurfaceAtRest(page, panel);
        await expect(image).toBeVisible();
        // A responsive panel handoff ends the old viewer; explicitly retake its new view.
        const take = surface.getByRole("button", { name: "Take control", exact: true });
        if (await take.count()) {
          await expect(take).toBeEnabled();
          await take.click();
        }
        await expect(input).toBeVisible();
        await expectSurfaceControls(page, panel);
        await image.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${screenshotDirectory}/${info.project.name}-${viewport.width}x${viewport.height}.png`,
        });
        await surface.getByRole("button", { name: "Expand screen", exact: true }).click();
        const expanded = page.getByRole("dialog", { name: "Computer screen", exact: true });
        await expectSurfaceAtRest(page, expanded);
        const expandedInput = expanded.getByRole("textbox", {
          name: "Computer screen input",
          exact: true,
        });
        await expect(expandedInput).toBeFocused();
        await expect(expanded.getByText("You control this screen", { exact: true })).toBeVisible();
        const expandedImage = expanded.getByRole("img", { name: "Computer screen", exact: true });
        await expect(expandedImage).toBeVisible();
        const beforeExpandedInput = await expandedImage.getAttribute("src");
        await expandedInput.press("e");
        await expect.poll(() => expandedImage.getAttribute("src")).not.toBe(beforeExpandedInput);
        await expectSurfaceControls(page, expanded);
        await page.screenshot({
          path: `${screenshotDirectory}/${info.project.name}-expanded-${viewport.width}x${viewport.height}.png`,
        });
        // The first Escape releases input without closing; the second closes only this dialog.
        await expandedInput.press("Escape");
        const expandedTake = expanded.getByRole("button", { name: "Take control", exact: true });
        await expect(expandedTake).toBeFocused();
        await expect(expanded).toBeVisible();
        await expandedTake.press("Escape");
        await expect(expanded).toHaveCount(0);
        await expect(
          surface.getByRole("button", { name: "Expand screen", exact: true }),
        ).toBeFocused();
        await expect(panel).toBeVisible();
        // Retake the unchanged viewer for the next size and the shared-control assertions.
        await surface.getByRole("button", { name: "Take control", exact: true }).click();
        await expect(input).toBeFocused();
      }
      // Escape returns control and focus; it must leave the computer sheet open.
      await input.focus();
      await input.press("Escape");
      await expect(
        surface.getByRole("button", { name: "Take control", exact: true }),
      ).toBeFocused();
      await expect(other.getByRole("button", { name: "Take control", exact: true })).toBeEnabled();
      await other.getByRole("button", { name: "Take control", exact: true }).click();
      await expect(
        surface.getByText(
          `Controlled by ${info.project.name === "web" ? "Web Space Member" : "Desktop Space Member"}`,
          { exact: true },
        ),
      ).toBeVisible();
      await surface.getByRole("button", { name: "Release member control", exact: true }).click();
      await expect(other.getByRole("button", { name: "Take control", exact: true })).toBeEnabled();
      const audit = await api.spaces.audit({ spaceId, limit: 100 });
      expect(
        audit.items.filter((entry) => entry.action === "computer.takeover.started").length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        audit.items.filter((entry) => entry.action === "computer.takeover.ended").length,
      ).toBeGreaterThanOrEqual(2);
      await surface.getByRole("button", { name: "Stop screen", exact: true }).click();
      await page
        .getByRole("alertdialog", { name: "Stop the screen?", exact: true })
        .getByRole("button", { name: "Stop screen", exact: true })
        .click();
      await expect(image).toHaveCount(0);
      await expect(other.getByText("Screen stopped", { exact: true }).first()).toBeVisible();
    } finally {
      await memberContext.close();
      await api.computers.stop({ spaceId });
      await api.spaces.delete({ spaceId });
    }
  });
}
