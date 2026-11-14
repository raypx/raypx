import { expect as baseExpect, test, type Page } from "@playwright/test";
import { createOwnedSpace } from "../helpers/owned-space.js";
import { selectOption } from "../helpers/select.js";
import { expectConversationHeaderControls } from "../helpers/conversation-header.js";
import { expectSurfaceAtRest, expectSurfaceControls } from "../helpers/geometry.js";

const actionTimeout = 5_000;
const expect = baseExpect.configure({ timeout: actionTimeout });

const apiUrl = process.env.CONTROL_E2E_API_URL;
const viewports = [
  { width: 1440, height: 860 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
];

async function createAgent(page: Page, name: string, instructions: string) {
  await page
    .getByRole("button", { name: "New Agent", exact: true })
    .click({ timeout: actionTimeout });
  const dialog = page.getByRole("dialog");
  await expectSurfaceAtRest(page, dialog);
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill(name, { timeout: actionTimeout });
  await dialog
    .getByRole("textbox", { name: "Instructions", exact: true })
    .fill(instructions, { timeout: actionTimeout });
  await selectOption(
    page,
    dialog.getByRole("combobox", { name: "Model", exact: true }),
    "browser-fixture",
    { timeout: actionTimeout },
  );
  await dialog
    .getByRole("button", { name: "Create Agent", exact: true })
    .click({ timeout: actionTimeout });
  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-conversation-header] h1")).toHaveText(name);
}

/** One owned-backend journey exercises the shared UI in both compiled renderers. */
export function registerTests() {
  test("mentions two Agents and restores delegated work and child approvals", async ({
    page,
    baseURL,
  }, info) => {
    test.skip(!apiUrl, "Requires the owned backend fixture from bun run test backends --with-e2e");
    if (!apiUrl || !baseURL) return;
    test.setTimeout(90_000);
    const origin = new URL(baseURL).origin;
    const signedIn = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
      headers: { origin },
      timeout: actionTimeout,
      data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
    });
    expect(signedIn.status()).toBe(200);
    await page.setViewportSize(viewports[0]!);
    const suffix = `${info.project.name}-${crypto.randomUUID()}`;
    const spaceId = await createOwnedSpace(page, apiUrl, origin, `Group ${suffix}`);
    await page.goto(`${baseURL}/agents?spaceId=${spaceId}`, { timeout: actionTimeout });
    await expect(page.getByRole("heading", { name: "Agents", exact: true })).toBeVisible();
    const coordinator = `协调者 Coordinator ${"long name ".repeat(4)}${suffix}`;
    const responder = `独立回复 Independent responder ${"长名称".repeat(12)}${suffix}`;
    const groupName = `协作讨论 Group conversation ${"long name 长名称 ".repeat(2)}${suffix}`;
    await createAgent(page, coordinator, "Fixture group coordinator.");
    await createAgent(page, responder, "Fixture group responder.");
    await page
      .getByRole("button", { name: "New group", exact: true })
      .click({ timeout: actionTimeout });
    const form = page.getByRole("dialog", { name: "New group", exact: true });
    await expectSurfaceAtRest(page, form);
    await form
      .getByRole("textbox", { name: "Group name", exact: true })
      .fill(groupName, { timeout: actionTimeout });
    for (const name of [coordinator, responder])
      await form.getByRole("checkbox", { name, exact: true }).check({ timeout: actionTimeout });
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expectSurfaceControls(page, form);
    }
    await form
      .getByRole("button", { name: "Create group", exact: true })
      .click({ timeout: actionTimeout });
    await expect(form).toBeHidden();
    await expect(page.locator("[data-conversation-header] h1")).toHaveText(groupName);

    const participantsTrigger = page.getByRole("button", { name: "Participants", exact: true });
    await participantsTrigger.click({ timeout: actionTimeout });
    const participants = page.getByRole("dialog", { name: "Participants", exact: true });
    await expectSurfaceControls(page, participants);
    await page.keyboard.press("Escape");
    await expect(participants).toBeHidden();
    await expect(participantsTrigger).toBeFocused();
    const editor = page.getByRole("textbox", { name: "Message", exact: true });
    await editor.fill("An unaddressed group draft", { timeout: actionTimeout });
    await expect(
      page.getByText("No Agent will respond without a mention.", { exact: true }),
    ).toBeVisible();
    await editor.fill("", { timeout: actionTimeout });
    await editor.pressSequentially("@", { timeout: actionTimeout });
    await expect(page.getByRole("option", { name: coordinator, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("option", { name: coordinator, exact: true })).toBeHidden();
    await expect(editor).toBeFocused();
    // Continue the existing query after Escape, as a member would; unchanged fill has no event.
    await editor.pressSequentially("C", { timeout: actionTimeout });
    const mentionSearch = page.getByRole("combobox", { name: "Mention an Agent", exact: true });
    await expect(
      mentionSearch,
      "Continuing @ after Escape reopens the mention picker",
    ).toBeVisible();
    await expect(mentionSearch).toHaveValue("C");
    await mentionSearch.fill("Coordinator", { timeout: actionTimeout });
    await expect(page.getByRole("option")).toHaveCount(1);
    await expect(page.getByRole("option", { name: coordinator, exact: true })).toHaveAttribute(
      "data-value",
      /.+/,
    );
    await mentionSearch.press("ArrowDown", { timeout: actionTimeout });
    await mentionSearch.press("Enter", { timeout: actionTimeout });
    await expect(editor).toBeFocused();
    await editor.pressSequentially(" @", { timeout: actionTimeout });
    await page
      .getByRole("option", { name: responder, exact: true })
      .click({ timeout: actionTimeout });
    await expect(editor).toBeFocused();
    await editor.pressSequentially(" Work together on the fixture task.", {
      timeout: actionTimeout,
    });
    const sending = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname.endsWith("/rpc/conversations/send"),
      { timeout: actionTimeout },
    );
    await page.getByRole("button", { name: "Send", exact: true }).click({ timeout: actionTimeout });
    const request = (await sending).postDataJSON() as {
      json: { conversationId: string; message: { mentions: string[] } };
    };
    expect(request.json.message.mentions).toHaveLength(2);
    expect(new Set(request.json.message.mentions).size).toBe(2);
    const independent = page.getByText("Fixture independent reply", { exact: true });
    await expect(independent).toBeVisible();
    await expect(
      page.getByText("Fixture coordinator is delegating.", { exact: true }),
    ).toBeVisible();
    const delegated = page.locator("[data-delegated-work]").first();
    await expect(delegated).toBeVisible();
    const approval = page
      .locator("[data-approval-card]")
      .filter({ hasText: "browser-group-fixture.txt" });
    await expect(approval).toBeVisible();
    await expect(approval.locator("[data-approval-agent]")).toContainText(coordinator);
    await expect(approval.locator("[data-approval-task]")).toBeVisible();
    await expect(approval.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
    await editor.fill("A draft while delegated work waits", { timeout: actionTimeout });
    await expect(editor).toBeEnabled();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expectConversationHeaderControls(page);
      await expectSurfaceAtRest(page, page.locator('section[aria-label="Conversation"]'));
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
    }
    await page.reload({ timeout: actionTimeout });
    await expect(approval).toBeVisible();
    await expect(delegated).toBeVisible();
    await expect(editor).toHaveValue("A draft while delegated work waits");
    await editor.fill("", { timeout: actionTimeout });
    await approval
      .getByRole("button", { name: "Approve", exact: true })
      .click({ timeout: actionTimeout });
    await expect(approval).toHaveCount(0);
    await expect(
      page.getByText("Fixture coordinator finished delegated work.", { exact: true }),
    ).toBeVisible();
    // One Agent finishing does not finish the other Agent's live reply.
    await expect(independent).toBeVisible();
    const children = delegated.locator("[data-child-run-id]");
    const expandDelegation = delegated.getByRole("button").first();
    await expandDelegation.click({ timeout: actionTimeout });
    await expect(children).toHaveCount(1);
    await expect(children.first()).toContainText("Finished");
    const childActivity = children.first().locator("[data-tool-activity]");
    await childActivity.getByRole("button").first().click({ timeout: actionTimeout });
    await expect(childActivity).toContainText("browser-group-fixture.txt");
    await expect(childActivity).toContainText("Succeeded");
    const childId = await children
      .first()
      .getAttribute("data-child-run-id", { timeout: actionTimeout });
    const finish = await page.request.post(`${apiUrl}/fixture/conversation/complete`, {
      headers: { origin },
      timeout: actionTimeout,
      data: { conversationId: request.json.conversationId },
    });
    expect(finish.status()).toBe(204);
    await expect(
      page.getByText("Fixture independent reply completed.", { exact: true }),
    ).toBeVisible();
    await page.reload({ timeout: actionTimeout });
    await expect(
      page.getByText("Fixture coordinator finished delegated work.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Fixture independent reply completed.", { exact: true }),
    ).toBeVisible();
    await delegated.getByRole("button").first().click({ timeout: actionTimeout });
    await expect(delegated.locator(`[data-child-run-id="${childId}"]`)).toContainText("Finished");
    await expect(page.locator("[data-approval-card]")).toHaveCount(0);
    // Child model text never appears as a separate conversation reply.
    await expect(page.getByText("Fixture delegated task finished.", { exact: true })).toHaveCount(
      0,
    );
  });
}
