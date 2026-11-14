import { expect as baseExpect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ownedApi } from "../helpers/owned-api.js";
import { selectOption } from "../helpers/select.js";
import { expectSurfaceAtRest, expectSurfaceControls } from "../helpers/geometry.js";
import { capture } from "../helpers/capture.js";

const timeout = 5_000;
const expect = baseExpect.configure({ timeout });
const apiUrl = process.env.CONTROL_E2E_API_URL;
const deviceName = "Browser fixture device";
const directory = "/fixture/device-workspace";
const warning = "Runs on your machine, not sandboxed. Commands use your OS permissions.";

async function openDevices(page: Page) {
  await page.getByRole("button", { name: "Space", exact: true }).click({ timeout });
  await page.getByRole("menuitem", { name: "Space settings", exact: true }).click({ timeout });
  const settings = page.getByRole("dialog", { name: "Space settings", exact: true });
  await expect(settings).toBeVisible();
  await selectOption(
    page,
    settings.getByRole("combobox", { name: "Section", exact: true }),
    "devices",
    { timeout },
  );
  const devices = settings.getByRole("region", { name: "Devices", exact: true });
  await expect(devices).toBeVisible();
  return { settings, devices };
}

async function typeText(input: Locator, value: string) {
  await input.click({ timeout });
  await input.pressSequentially(value, { timeout });
}

/** The fake connector simulates native confirmation without executing on the fixture host. */
export function registerTests() {
  test.use({ trace: "off", video: "off", screenshot: "off" });
  test("pairs a device, grants a directory and approves its command", async ({
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
    const { space } = await api.spaces.create({
      name: `Devices ${info.project.name} ${crypto.randomUUID()}`,
    });
    const spaceId = space.id;
    try {
      // The always-approve review fixture must still leave device commands to the member.
      await api.spaces.setApprovalOverride({ spaceId, mode: "auto" });
      const { agent, conversation } = await api.agents.create({
        spaceId,
        agent: {
          name: "Device Agent",
          instructions: "Run only the member's requested device command.",
          model: { modelId: "browser-fixture" },
        },
      });
      const agentsUrl = `${baseURL}/agents?spaceId=${spaceId}&agentId=${agent.id}`;
      await page.setViewportSize({ width: 1440, height: 860 });
      await page.goto(agentsUrl, { timeout });
      let { settings, devices } = await openDevices(page);
      await expect(devices).toContainText(warning);
      await devices.getByRole("button", { name: "Pair a device", exact: true }).click({ timeout });
      const code = await devices
        .getByRole("textbox", { name: "Pairing code", exact: true })
        .inputValue({ timeout });
      expect(code.length).toBeGreaterThanOrEqual(6);
      const paired = await page.request.post(`${apiUrl}/fixture/device/pair`, {
        headers: { origin },
        data: { code },
        timeout,
      });
      expect(paired.status()).toBe(200);
      const { deviceId } = (await paired.json()) as { deviceId: string };
      await devices.getByRole("button", { name: "Refresh", exact: true }).click({ timeout });
      let row = devices.locator(`[data-device="${deviceId}"]`);
      await expect(row).toContainText(deviceName);
      await expect(row).toContainText("Connected");
      await row.getByRole("button", { name: "Grant a directory", exact: true }).click({ timeout });
      await expect
        .poll(async () => (await api.deviceComputers.list({ spaceId })).devices[0]?.grants.length, {
          timeout,
        })
        .toBe(1);
      await devices.getByRole("button", { name: "Refresh", exact: true }).click({ timeout });
      await expect(row).toContainText(directory);
      const device = (await api.deviceComputers.list({ spaceId })).devices.find(
        (entry) => entry.id === deviceId,
      )!;
      const grant = device.grants[0]!;
      expect(JSON.stringify(device)).not.toMatch(/credential|claimToken|confirmationId/);

      // Unmounting clears the one-time pairing code before optional review captures.
      await page.goto(agentsUrl, { timeout });
      ({ settings, devices } = await openDevices(page));
      row = devices.locator(`[data-device="${deviceId}"]`);
      await expect(devices.getByRole("textbox", { name: "Pairing code", exact: true })).toHaveCount(
        0,
      );
      const evidence = fileURLToPath(new URL("../../../.artifacts/device/", import.meta.url));
      await mkdir(evidence, { recursive: true });
      for (const viewport of [
        { width: 1440, height: 860 },
        { width: 375, height: 812 },
      ]) {
        await page.setViewportSize(viewport);
        await row.scrollIntoViewIfNeeded({ timeout });
        await expectSurfaceAtRest(page, settings);
        await expectSurfaceControls(page, row);
        if (info.project.name === "web")
          await capture(page, {
            path: `${evidence}/devices-${viewport.width}x${viewport.height}.png`,
          });
      }
      await page.setViewportSize({ width: 1440, height: 860 });
      await page.goto(agentsUrl, { timeout });
      await page.getByRole("button", { name: /^Computer:/ }).click({ timeout });
      const selector = page.getByRole("combobox", { name: "Run computer", exact: true });
      await selector.click({ timeout });
      await page
        .getByRole("option", { name: `${deviceName} · ${directory}`, exact: true })
        .click({ timeout });
      await expect(selector).toContainText(deviceName);
      await expect(page.locator("[data-device-warning]")).toHaveText(warning);
      await expect
        .poll(
          async () =>
            (await api.deviceComputers.getSelection({ spaceId, conversationId: conversation.id }))
              .selection,
          { timeout },
        )
        .toEqual({ deviceId, grantId: grant.id });
      await page
        .getByRole("button", { name: "Close computer panel", exact: true })
        .click({ timeout });
      await typeText(
        page.getByRole("textbox", { name: "Message", exact: true }),
        "Fixture device command",
      );
      await page.getByRole("button", { name: "Send", exact: true }).click({ timeout });
      const approval = page.locator("[data-approval-card]");
      await expect(approval).toBeVisible();
      await expect(approval.locator("[data-approval-device]")).toContainText(deviceName);
      await expect(approval).toContainText(directory);
      await expect(approval).toContainText("echo");
      await expect(approval).toContainText(warning);
      const pending = await api.approvals.pending({ spaceId });
      expect(pending).toHaveLength(1);
      expect(pending[0]!.toolName).toBe("computer_run_command");
      expect(pending[0]!.review?.verdict).not.toBe("approve");
      const deviceStatus = async () => {
        const response = await page.request.post(`${apiUrl}/fixture/device/status`, {
          headers: { origin },
          data: { deviceId },
          timeout,
        });
        expect(response.status()).toBe(200);
        return response.json() as Promise<{ executionCount: number; connected: boolean }>;
      };
      expect((await deviceStatus()).executionCount).toBe(0);
      await approval.getByRole("button", { name: "Approve", exact: true }).click({ timeout });
      await expect(approval).toBeHidden();
      const selection = { spaceId, conversationId: conversation.id };
      await expect
        .poll(async () => (await api.conversations.snapshot(selection)).runs[0]?.state, { timeout })
        .toBe("succeeded");
      expect((await deviceStatus()).executionCount).toBe(1);
      const snapshot = await api.conversations.snapshot(selection);
      expect(
        snapshot.toolActivity?.find((entry) => entry.toolName === "computer_run_command")?.outcome,
      ).toBe("succeeded");
      expect(
        (await api.approvals.effects({ spaceId, runId: snapshot.runs[0]!.id })).map(
          (entry) => entry.state,
        ),
      ).toEqual(["succeeded"]);
      await page.reload({ timeout });
      await expect(
        page.getByRole("button", { name: new RegExp(`^Computer: ${deviceName}`) }),
      ).toBeVisible();
      ({ devices } = await openDevices(page));
      row = devices.locator(`[data-device="${deviceId}"]`);
      await row.getByRole("button", { name: "Revoke", exact: true }).first().click({ timeout });
      const confirm = page.getByRole("alertdialog");
      await confirm.getByRole("button", { name: "Revoke", exact: true }).click({ timeout });
      await expect(row).toContainText("Revoked");
      await expect.poll(async () => (await deviceStatus()).connected, { timeout }).toBe(false);
    } finally {
      await api.spaces.delete({ spaceId });
    }
  });
}
