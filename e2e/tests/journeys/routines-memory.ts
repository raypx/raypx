import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  expectConversationHeaderControls,
  openConversationCapability,
} from "../helpers/conversation-header.js";
import { selectOption } from "../helpers/select.js";

const apiUrl = process.env.CONTROL_E2E_API_URL;
const viewports = [
  { width: 1440, height: 860 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
];

/** Base UI sheets/dialogs may already be visible while still moving. */
async function settle(surface: Locator) {
  await expect(surface).toBeVisible();
  await surface.evaluate(async (node) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await Promise.all(
      node.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

async function expectGeometry(page: Page, surface: Locator) {
  await settle(surface);
  const viewport = page.viewportSize()!;
  // A resize or an opening sheet can start a transition after the animation list was read;
  // wait until the surface has come to rest inside the viewport before asserting its box.
  await expect
    .poll(async () => {
      const moving = await surface.boundingBox();
      return moving !== null && moving.x >= 0 && moving.x + moving.width <= viewport.width + 1;
    })
    .toBe(true);
  const box = await surface.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(await surface.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

/** The same owned-backend journey runs against both compiled renderers. */
export function registerTests() {
  test("creates a routine, opens its Run and restores shared Space memory", async ({
    page,
    baseURL,
  }, info) => {
    test.skip(!apiUrl, "Requires the owned backend fixture from bun run test backends --with-e2e");
    if (!apiUrl || !baseURL) return;
    test.setTimeout(90_000);
    const origin = new URL(baseURL).origin;
    // Desktop's real login opens the system browser. Seed a real cookie session in
    // this isolated browser context so this journey exercises the shared renderer.
    const signIn = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
      headers: { origin },
      data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
    });
    expect(signIn.status()).toBe(200);
    await page.setViewportSize({ width: 1440, height: 860 });
    await page.goto(`${baseURL}/agents`);
    await expect(page.getByRole("heading", { name: "Agents", exact: true })).toBeVisible();
    const suffix = `${info.project.name}-${crypto.randomUUID()}`;
    const agentName = `团队例行检查 Long Agent name 团队例行检查 Long Agent name ${suffix}`;
    await page.getByRole("button", { name: "New Agent", exact: true }).click();
    const agentForm = page.getByRole("dialog");
    await settle(agentForm);
    await agentForm.getByRole("textbox", { name: "Name", exact: true }).fill(agentName);
    await agentForm
      .getByRole("textbox", { name: "Instructions", exact: true })
      .fill("Reply briefly.");
    await selectOption(
      page,
      agentForm.getByRole("combobox", { name: "Model", exact: true }),
      "browser-fixture",
    );
    await agentForm.getByRole("button", { name: "Create Agent", exact: true }).click();
    await expect(agentForm).toBeHidden();
    await expect(page.locator("[data-conversation-header] h1")).toHaveText(agentName);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expectConversationHeaderControls(page);
    }
    await page.setViewportSize({ width: 1440, height: 860 });
    await openConversationCapability(page, "Routines");
    const routines = page.getByRole("dialog", { name: "Routines", exact: true });
    await settle(routines);
    await routines.getByRole("button", { name: "New routine", exact: true }).click();
    const routineForm = page.getByRole("dialog", { name: "New routine", exact: true });
    await settle(routineForm);
    const routineName = `Daily review ${suffix}`;
    await routineForm.getByRole("textbox", { name: "Name", exact: true }).fill(routineName);
    await routineForm
      .getByRole("textbox", { name: "Prompt", exact: true })
      .fill(`Review the day's work ${suffix}`);
    await routineForm.getByRole("checkbox", { name: "Cron", exact: true }).check();
    await routineForm
      .getByRole("textbox", { name: "Cron expression", exact: true })
      .fill("0 9 * * 1-5");
    await selectOption(
      page,
      routineForm.getByRole("combobox", { name: "Time zone", exact: true }),
      "UTC",
    );
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expectGeometry(page, routineForm);
    }
    await routineForm.getByRole("button", { name: "Create routine", exact: true }).click();
    await expect(routineForm).toContainText("Routine saved.");
    await routineForm.getByRole("button", { name: "Done", exact: true }).click();
    await expect(routineForm).toBeHidden();
    const routine = routines.getByRole("article", { name: routineName, exact: true });
    await expect(routine).toBeVisible();
    await expect(routine).toContainText("UTC");
    const tested = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/rpc/routines/test") &&
        response.request().method() === "POST",
    );
    await routine.getByRole("button", { name: "Run now", exact: true }).click();
    const response = await tested;
    expect(response.ok()).toBe(true);
    const result = (await response.json()) as { json: { runId: string; status: string } };
    expect(result.json.status).toBe("fired");
    await expect(routines).toBeHidden();
    const reply = page.locator(`[data-run-id="${result.json.runId}"]`);
    await expect(reply).toContainText("Routine");
    await expect(reply).toContainText("Fixture reply");
    await expect(reply).toContainText("Fixture reply completed.");
    await openConversationCapability(page, "Routines");
    await settle(routines);
    await routine.getByRole("button", { name: "History", exact: true }).click();
    const runHistory = page.getByRole("dialog", { name: "Run history", exact: true });
    await settle(runHistory);
    await expect(runHistory).toContainText("Started");
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expectGeometry(page, runHistory);
    }
    await runHistory.getByRole("button", { name: "Open Run", exact: true }).first().click();
    await expect(runHistory).toBeHidden();
    await expect(routines).toBeHidden();
    await expect(reply).toBeInViewport();

    const memoryTrigger = await openConversationCapability(page, "Memory");
    const memory = page.getByRole("dialog", { name: "Memory", exact: true });
    await settle(memory);
    await memory.getByRole("button", { name: "New document", exact: true }).click();
    const documentForm = page.getByRole("dialog", { name: "New document", exact: true });
    await settle(documentForm);
    const title = `Team conventions ${suffix}`;
    const firstText = "# Team conventions\n\nReview changes before saving.";
    const secondText = "# Team conventions\n\nReview changes and run focused tests.";
    await selectOption(
      page,
      documentForm.getByRole("combobox", { name: "Scope", exact: true }),
      "space",
    );
    await documentForm.getByRole("textbox", { name: "Title", exact: true }).fill(title);
    await documentForm
      .getByRole("textbox", { name: "Markdown source", exact: true })
      .fill(firstText);
    await documentForm.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(documentForm).toBeHidden();
    await expect(
      memory.getByRole("heading", { name: "Shared in this Space", exact: true }),
    ).toBeVisible();
    await memory.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
    const editForm = page.getByRole("dialog", { name: "Edit document", exact: true });
    await settle(editForm);
    await editForm.getByRole("textbox", { name: "Markdown source", exact: true }).fill(secondText);
    await editForm.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editForm).toBeHidden();
    await memory.getByRole("button", { name: `History for ${title}`, exact: true }).click();
    const revisions = page.getByRole("dialog", { name: "Revision history", exact: true });
    await settle(revisions);
    await selectOption(
      page,
      revisions.getByRole("combobox", { name: "Revision", exact: true }),
      "1",
    );
    await expect(
      revisions.getByRole("region", { name: "This revision", exact: true }),
    ).toContainText("Review changes before saving.");
    await expect(revisions.getByRole("region", { name: "Current", exact: true })).toContainText(
      "Review changes and run focused tests.",
    );
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expectGeometry(page, revisions);
    }
    await revisions.getByRole("button", { name: "Restore revision 1", exact: true }).click();
    const restore = page.getByRole("alertdialog", { name: "Restore revision 1?", exact: true });
    await settle(restore);
    await restore.getByRole("button", { name: "Restore revision", exact: true }).click();
    await expect(restore).toBeHidden();
    await expect(revisions.getByRole("region", { name: "Current", exact: true })).toContainText(
      "Review changes before saving.",
    );
    await revisions.getByRole("button", { name: "Close", exact: true }).click();
    await expect(revisions).toBeHidden();
    await memory.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
    await expect(
      editForm.getByRole("textbox", { name: "Markdown source", exact: true }),
    ).toHaveValue(firstText);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expectGeometry(page, editForm);
    }
    await editForm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(editForm).toBeHidden();
    await expect(memory.getByRole("button", { name: `Edit ${title}`, exact: true })).toBeFocused();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expectGeometry(page, memory);
    }
    await page.keyboard.press("Escape");
    await expect(memory).toBeHidden();
    await expect(memoryTrigger).toBeFocused();
    const routinesTrigger = await openConversationCapability(page, "Routines");
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expectGeometry(page, routines);
    }
    await page.keyboard.press("Escape");
    await expect(routines).toBeHidden();
    await expect(routinesTrigger).toBeFocused();
    await page.reload();
    await expect(page.locator(`[data-run-id="${result.json.runId}"]`)).toContainText("Routine");
  });
}
