import { expect, test, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ownedApi } from "../helpers/owned-api.js";
import { capture } from "../helpers/capture.js";
const endpoint = process.env.CONTROL_E2E_API_URL;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yGIoAAAAASUVORK5CYII=",
  "base64",
);
async function signIn(page: Page, baseURL: string, email = "control-e2e@example.com") {
  const origin = new URL(baseURL).origin;
  const response = await page.request.post(`${endpoint}/api/auth/sign-in/email`, {
    headers: { origin },
    data: { email, password: "Raypx-control-test-123" },
  });
  expect(response.status()).toBe(200);
  return ownedApi(page, origin, endpoint!);
}
async function screenshots(page: Page, surface: string, name: string) {
  const directory = fileURLToPath(new URL("../../../.artifacts/attach/", import.meta.url));
  await mkdir(directory, { recursive: true });
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate((value) => {
      document.documentElement.classList.toggle("dark", value === "dark");
      document.documentElement.style.colorScheme = value;
    }, theme);
    await capture(page, { path: `${directory}/${surface}-${name}-${theme}.png`, fullPage: true });
  }
}
export function registerTests() {
  test("attaches files and images, sends image parts and retains downloads after reload", async ({
    page,
    baseURL,
  }, info) => {
    test.skip(!endpoint, "Requires the owned backend fixture");
    if (!endpoint || !baseURL) return;
    test.setTimeout(90_000);
    const api = await signIn(page, baseURL);
    const { space } = await api.spaces.create({
      name: `Attachments ${info.project.name} ${crypto.randomUUID()}`,
    });
    try {
      const { agent, conversation } = await api.agents.create({
        spaceId: space.id,
        agent: {
          name: "Attachment reader",
          instructions: "Read the supplied member data.",
          model: { modelId: "browser-fixture" },
        },
      });
      await page.setViewportSize({ width: 1440, height: 860 });
      await page.goto(`${baseURL}/agents?spaceId=${space.id}&agentId=${agent.id}`);
      await page.getByRole("textbox", { name: "Message", exact: true }).waitFor();
      await page.getByRole("button", { name: "Add context", exact: true }).click();
      await page.getByRole("menuitem", { name: "Attach files", exact: true }).click();
      const input = page.locator('input[type="file"]');
      await input.setInputFiles([
        {
          name: "notes.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Member attachment contents\n".repeat(14_000)),
        },
      ]);
      const editor = page.getByRole("textbox", { name: "Message", exact: true });
      await editor.evaluate((element, base64) => {
        const data = new DataTransfer();
        data.items.add(
          new File(
            [Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))],
            "image.png",
            { type: "image/png" },
          ),
        );
        element.dispatchEvent(
          new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }),
        );
      }, png.toString("base64"));
      await editor.evaluate((element) => {
        const data = new DataTransfer();
        data.items.add(new File(["Dropped member data"], "drop.txt", { type: "text/plain" }));
        element.dispatchEvent(
          new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }),
        );
      });
      await page.getByRole("button", { name: "Remove drop.txt", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Remove image.png", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Remove notes.txt", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Uploading…", { exact: true })).toHaveCount(0);
      await screenshots(page, info.project.name, "composer");
      await page
        .getByRole("textbox", { name: "Message", exact: true })
        .fill("Fixture attachments inspect");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(
        page.getByText("Attachment input: images=1; files=1 completed.", { exact: true }),
      ).toBeVisible();
      await page.reload();
      const chip = page.getByRole("button", { name: "Download notes.txt", exact: true });
      await expect(chip).toBeVisible();
      const download = page.waitForEvent("download");
      await chip.click();
      const result = await download;
      expect(result.suggestedFilename()).toBe("notes.txt");
      expect((await readFile(await result.path())).toString()).toBe(
        "Member attachment contents\n".repeat(14_000),
      );
      const history = await api.conversations.history({
        spaceId: space.id,
        conversationId: conversation.id,
      });
      expect(history.messages[0]?.attachments).toHaveLength(2);
      const attachment = history.messages[0]!.attachments![0]!;
      const raw = await page.request.get(
        `${endpoint}/message-attachments/${space.id}/${conversation.id}/${attachment.id}`,
      );
      expect(raw.status()).toBe(200);
      expect(raw.headers()["content-disposition"]).toContain("attachment;");
      expect(raw.headers()["x-content-type-options"]).toBe("nosniff");
      await screenshots(page, info.project.name, "history");
    } finally {
      await api.spaces.delete({ spaceId: space.id });
    }
  });
  test("browses device Files with the sandbox stopped and withholds uploads after grant revocation", async ({
    page,
    baseURL,
  }, info) => {
    test.skip(!endpoint, "Requires the owned backend fixture");
    if (!endpoint || !baseURL) return;
    test.setTimeout(90_000);
    const api = await signIn(page, baseURL),
      origin = new URL(baseURL).origin;
    const { space } = await api.spaces.create({
      name: `Device files ${info.project.name} ${crypto.randomUUID()}`,
    });
    try {
      const { agent, conversation } = await api.agents.create({
        spaceId: space.id,
        agent: {
          name: "Device reader",
          instructions: "Read only the granted directory.",
          model: { modelId: "browser-fixture" },
        },
      });
      const pair = await api.deviceComputers.createPairing({ spaceId: space.id });
      const paired = await page.request.post(`${endpoint}/fixture/device/pair`, {
        headers: { origin },
        data: { code: pair.code },
      });
      expect(paired.status()).toBe(200);
      const { deviceId } = (await paired.json()) as { deviceId: string };
      await api.deviceComputers.requestGrant({ spaceId: space.id, deviceId });
      await expect
        .poll(
          async () =>
            (await api.deviceComputers.list({ spaceId: space.id })).devices.find(
              (device) => device.id === deviceId,
            )?.grants.length,
        )
        .toBe(1);
      const grant = (await api.deviceComputers.list({ spaceId: space.id })).devices.find(
        (device) => device.id === deviceId,
      )!.grants[0]!;
      await api.deviceComputers.select({
        spaceId: space.id,
        conversationId: conversation.id,
        selection: { deviceId, grantId: grant.id },
      });
      await page.goto(`${baseURL}/agents?spaceId=${space.id}&agentId=${agent.id}`);
      await page.getByRole("tab", { name: "Files", exact: true }).click();
      await expect(
        page.getByRole("treeitem", { name: "device-notes.txt", exact: true }),
      ).toBeVisible();
      await page.getByRole("treeitem", { name: "device-notes.txt", exact: true }).click();
      await expect(page.getByText("Device fixture notes", { exact: true })).toBeVisible();
      await screenshots(page, info.project.name, "device-files");
      const invitation = await api.spaces.createInvitation({ spaceId: space.id });
      const memberContext = await page.context().browser()!.newContext();
      try {
        const memberPage = await memberContext.newPage();
        const memberApi = await signIn(
          memberPage,
          baseURL,
          `control-member-${info.project.name}@example.com`,
        );
        await memberApi.spaces.acceptInvitation({ token: invitation.token });
        expect(
          await memberApi.computers.listDirectory({
            spaceId: space.id,
            device: { deviceId, grantId: grant.id },
            path: ".",
          }),
        ).toEqual({ status: "unavailable", code: "DEVICE_NOT_OWNED" });
      } finally {
        await memberContext.close();
      }

      expect(await api.computers.get({ spaceId: space.id })).toMatchObject({
        status: "available",
        computer: null,
      });
      const offline = await page.request.post(`${endpoint}/fixture/device/offline`, {
        headers: { origin },
        data: { deviceId },
      });
      expect(offline.status()).toBe(200);
      await page.getByRole("button", { name: "Refresh files", exact: true }).click();
      await expect(
        page.getByText("Waiting for device. Reconnect it, then refresh.", { exact: true }).first(),
      ).toBeVisible();
      await api.deviceComputers.revokeGrant({ spaceId: space.id, deviceId, grantId: grant.id });
      await page.getByRole("button", { name: "Refresh files", exact: true }).click();
      await expect(
        page.getByText("This device directory grant is unavailable.", { exact: true }).first(),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Conversation", exact: true }).click();
      await page.locator('input[type="file"]').setInputFiles({
        name: "withheld.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Withhold this file"),
      });
      await expect(page.getByText("Uploading…", { exact: true })).toHaveCount(0);
      await page
        .getByRole("textbox", { name: "Message", exact: true })
        .fill("Fixture attachments revoked");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(
        page.getByText("File withheld: a directory grant from its owner is required.", {
          exact: true,
        }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByText("File withheld: a directory grant from its owner is required.", {
          exact: true,
        }),
      ).toBeVisible();
      await screenshots(page, info.project.name, "withheld");
    } finally {
      await api.spaces.delete({ spaceId: space.id });
    }
  });
  test("shows unread completion, approval and invitation notifications with source navigation", async ({
    page,
    baseURL,
  }, info) => {
    test.skip(!endpoint, "Requires the owned backend fixture");
    if (!endpoint || !baseURL) return;
    test.setTimeout(90_000);
    const api = await signIn(page, baseURL);
    const { space } = await api.spaces.create({
      name: `Notifications ${info.project.name} ${crypto.randomUUID()}`,
    });
    try {
      const { agent, conversation } = await api.agents.create({
        spaceId: space.id,
        agent: {
          name: "Notification reader",
          instructions: "Respond to member requests.",
          model: { modelId: "browser-fixture" },
        },
      });
      await api.spaces.createInvitation({ spaceId: space.id });
      await api.conversations.send({
        spaceId: space.id,
        conversationId: conversation.id,
        message: { text: "Fixture attachments away", idempotencyKey: crypto.randomUUID() },
      });
      await expect
        .poll(async () =>
          (await api.notifications.list({})).items
            .filter((item) => item.spaceId === space.id)
            .map((item) => item.kind),
        )
        .toContain("run-succeeded");
      expect(
        (await api.notifications.list({})).items.find(
          (item) => item.spaceId === space.id && item.kind === "run-succeeded",
        )?.unread,
      ).toBe(true);
      await page.goto(`${baseURL}/agents?spaceId=${space.id}`);
      await page.getByRole("button", { name: "Notifications", exact: true }).click();
      const group = page.getByRole("region", { name: space.name, exact: true });
      await expect(group.getByRole("heading", { name: space.name, exact: true })).toBeVisible();
      const source = group.getByRole("button", { name: /Run finished/ });
      await expect(source).toBeVisible();
      await expect(source).toContainText("Unread");
      await screenshots(page, info.project.name, "notifications");
      await source.click();
      await expect(page).toHaveURL(new RegExp(`agentId=${agent.id}`));
      await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
      await expect
        .poll(
          async () =>
            (await api.notifications.list({})).items.find(
              (item) => item.spaceId === space.id && item.kind === "run-succeeded",
            )?.unread,
        )
        .toBe(false);
      await api.conversations.send({
        spaceId: space.id,
        conversationId: conversation.id,
        message: { text: "Fixture protected command", idempotencyKey: crypto.randomUUID() },
      });
      await expect
        .poll(async () =>
          (await api.notifications.list({})).items
            .filter((item) => item.spaceId === space.id)
            .map((item) => item.kind),
        )
        .toContain("approval");
      const approval = (await api.approvals.pending({ spaceId: space.id }))[0]!;
      await api.approvals.answer({
        spaceId: space.id,
        requestId: approval.id,
        decision: "approved",
      });
      await expect
        .poll(async () =>
          (await api.notifications.list({})).items
            .filter((item) => item.spaceId === space.id)
            .map((item) => item.kind),
        )
        .toContain("protected-input");
      const failed = await api.agents.create({
        spaceId: space.id,
        agent: {
          name: "Failure fixture",
          instructions: "",
          model: { modelId: "browser-failure-fixture" },
        },
      });
      await api.conversations.send({
        spaceId: space.id,
        conversationId: failed.conversation.id,
        message: { text: "Fail visibly", idempotencyKey: crypto.randomUUID() },
      });
      await expect
        .poll(async () =>
          (await api.notifications.list({})).items
            .filter((item) => item.spaceId === space.id)
            .map((item) => item.kind),
        )
        .toContain("run-failed");
      const pending = await api.conversations.snapshot({
        spaceId: space.id,
        conversationId: conversation.id,
      });
      for (const run of pending.runs.filter((candidate) =>
        ["queued", "running", "waiting"].includes(candidate.state),
      ))
        await api.conversations.stop({
          spaceId: space.id,
          conversationId: conversation.id,
          runId: run.id,
        });
    } finally {
      await api.spaces.delete({ spaceId: space.id });
    }
  });
}
