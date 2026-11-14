import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { ownedApi } from "../helpers/owned-api.js";
import { expectSurfaceAtRest, expectSurfaceControls } from "../helpers/geometry.js";
import { capture } from "../helpers/capture.js";
import { selectOption } from "../helpers/select.js";

const timeout = 5_000;
const expect = baseExpect.configure({ timeout });
const apiUrl = process.env.CONTROL_E2E_API_URL;
const reviewDirectory = fileURLToPath(new URL("../../../.artifacts/ui/", import.meta.url));

async function openTab(page: Page, name: "Conversation" | "Activity" | "Files") {
  await page.getByRole("tab", { name, exact: true }).click({ timeout });
  await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
}

/** Persisted deterministic content exercises layout without a paid model or operator data. */
export function registerTests() {
  test.use({ trace: "off", video: "off", screenshot: "off", reducedMotion: "reduce" });
  test("sends from home to the chosen Agent and keeps other drafts isolated", async ({
    page,
    baseURL,
  }, info) => {
    test.skip(!apiUrl, "Requires the owned backend fixture");
    if (!apiUrl || !baseURL) return;
    test.setTimeout(45_000);
    const origin = new URL(baseURL).origin;
    const login = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
      headers: { origin },
      timeout,
      data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
    });
    expect(login.status()).toBe(200);
    const api = ownedApi(page, origin, apiUrl);
    const { space } = await api.spaces.create({
      name: `Home ${info.project.name} ${crypto.randomUUID()}`,
    });
    const spaceId = space.id;
    try {
      const created = [];
      for (const name of ["Notes partner", "Outline partner"])
        created.push(
          await api.agents.create({
            spaceId,
            agent: {
              name,
              instructions: "Reply briefly.",
              model: { modelId: "browser-fixture" },
            },
          }),
        );
      const notes = created[0]!;
      const outline = created[1]!;
      await page.goto(`${baseURL}/agents?spaceId=${spaceId}`, { timeout });
      const directory = page
        .getByRole("navigation", { name: "Raypx", exact: true })
        .getByRole("region", { name: "Agents", exact: true });
      await directory.hover({ timeout });
      const filter = directory.getByRole("button", { name: "Filter Agents", exact: true });
      await filter.click({ timeout });
      const query = directory.getByRole("textbox", { name: "Filter Agents", exact: true });
      await expect(query).toBeFocused();
      await query.pressSequentially("Outline", { timeout });
      await expect(
        directory.getByRole("button", { name: "Notes partner", exact: true }),
      ).toHaveCount(0);
      await expect(
        directory.getByRole("button", { name: "Outline partner", exact: true }),
      ).toBeVisible();
      await query.press("Escape", { timeout });
      await expect(query).toHaveValue("");
      await query.press("Escape", { timeout });
      await expect(query).toHaveCount(0);
      await expect(filter).toBeFocused();
      const target = page.getByRole("combobox", { name: "Choose an Agent", exact: true });
      await selectOption(page, target, notes.agent.id, { timeout });
      const editor = page.getByRole("textbox", { name: "Message", exact: true });
      await editor.pressSequentially("A private unsent note", { timeout });
      await selectOption(page, target, outline.agent.id, { timeout });
      await expect(editor).toHaveValue("");
      await editor.pressSequentially("Help me outline the next step.", { timeout });
      await page.getByRole("button", { name: "Send", exact: true }).click({ timeout });
      await expect(page).toHaveURL((url) => url.searchParams.get("agentId") === outline.agent.id);
      await expect(page.locator("[data-conversation-header] h1")).toHaveText("Outline partner");
      await expect(page.getByText("Help me outline the next step.", { exact: true })).toBeVisible();
      const selection = { spaceId, conversationId: outline.conversation.id };
      await expect
        .poll(async () => (await api.conversations.snapshot(selection)).messages.length)
        .toBe(1);
      expect(
        (await api.conversations.snapshot({ spaceId, conversationId: notes.conversation.id }))
          .messages,
      ).toHaveLength(0);
      await page.getByRole("button", { name: "New", exact: true }).click({ timeout });
      await expect(page.locator("[data-workspace-home]")).toBeVisible();
      await expect(target).toContainText("Outline partner");
      await selectOption(page, target, notes.agent.id, { timeout });
      await expect(editor).toHaveValue("A private unsent note");
    } finally {
      await api.spaces.delete({ spaceId });
    }
  });
  test("reviews the signed-in workspace across sizes and themes", async ({
    page,
    baseURL,
  }, info) => {
    test.skip(
      !apiUrl || process.env.RAYPX_E2E_SCREENSHOTS !== "1",
      "Requires owned API and --visual",
    );
    if (!apiUrl || !baseURL) return;
    test.setTimeout(240_000);
    await mkdir(reviewDirectory, { recursive: true });
    const origin = new URL(baseURL).origin;
    const login = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
      headers: { origin },
      data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
      timeout,
    });
    expect(login.status()).toBe(200);
    const api = ownedApi(page, origin, apiUrl);
    const suffix = `${info.project.name}-${crypto.randomUUID()}`;
    const { space } = await api.spaces.create({ name: `Design studio ${suffix}` });
    const { space: empty } = await api.spaces.create({ name: `Empty studio ${suffix}` });
    const spaceId = space.id;
    try {
      await api.spaces.setApprovalOverride({ spaceId, mode: "ask" });
      const agents = [];
      for (const name of ["Research partner", "Writing partner", "Planning partner"]) {
        agents.push(
          await api.agents.create({
            spaceId,
            agent: {
              name,
              instructions: "Fixture workspace review.",
              model: { modelId: "browser-fixture" },
            },
          }),
        );
      }
      const primary = agents[0]!;
      await api.conversations.createGroup({
        spaceId,
        name: "Launch discussion",
        agentIds: agents.map(({ agent }) => agent.id),
      });
      const selection = { spaceId, conversationId: primary.conversation.id };
      const approvalAgent = agents[1]!;
      const approvalSelection = { spaceId, conversationId: approvalAgent.conversation.id };
      const history = await page.request.post(`${apiUrl}/fixture/conversation/history`, {
        headers: { origin },
        data: { ...selection, count: 45, prefix: "Earlier discussion" },
        timeout,
      });
      expect(history.status()).toBe(200);
      await api.conversations.send({
        ...selection,
        message: { text: `Fixture file write ${suffix}`, idempotencyKey: crypto.randomUUID() },
      });
      await expect.poll(async () => (await api.approvals.pending({ spaceId })).length).toBe(1);
      const pending = (await api.approvals.pending({ spaceId }))[0]!;
      await api.approvals.answer({ spaceId, requestId: pending.id, decision: "approved" });
      await expect
        .poll(async () =>
          (await api.conversations.snapshot(selection)).runs.some((run) => run.state === "running"),
        )
        .toBe(true);
      await expect
        .poll(async () => (await api.conversations.snapshot(selection)).toolActivity?.length ?? 0)
        .toBeGreaterThan(0);
      const home = `${baseURL}/agents?spaceId=${spaceId}`;
      const conversation = `${home}&agentId=${primary.agent.id}`;
      await page.goto(conversation, { timeout });
      await expect(page.getByText("A clear starting point", { exact: true })).toBeVisible();
      // The fixture gates completion so screenshots always capture committed reply actions.
      await page.request.post(`${apiUrl}/fixture/conversation/complete`, {
        headers: { origin },
        data: { conversationId: primary.conversation.id },
        timeout,
      });
      await expect
        .poll(async () =>
          (await api.conversations.snapshot(selection)).runs.some(
            (run) => run.state === "succeeded",
          ),
        )
        .toBe(true);
      await api.computers.startScreen({ spaceId });
      const sizes =
        info.project.name === "desktop"
          ? [{ width: 1440, height: 860 }]
          : [
              { width: 1440, height: 860 },
              { width: 1024, height: 768 },
              { width: 375, height: 812 },
            ];
      const pointer = await page.context().newCDPSession(page);
      for (const theme of ["light", "dark"] as const) {
        for (const viewport of sizes) {
          await page.setViewportSize(viewport);
          await pointer.send("Emulation.setTouchEmulationEnabled", {
            enabled: viewport.width < 640,
            maxTouchPoints: 1,
          });
          await expect
            .poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches))
            .toBe(viewport.width < 640);
          await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
          await page.goto(home, { timeout });
          await page.evaluate((value) => {
            localStorage.setItem("theme", value);
            localStorage.setItem("raypx_sidebar_open", "true");
          }, theme);
          await page.reload({ timeout });
          const prefix = `${info.project.name}-${viewport.width}x${viewport.height}-${theme}`;
          async function review(name: string) {
            const main = page.locator("#main");
            try {
              await expectSurfaceControls(page, main);
            } catch (error) {
              await capture(page, {
                path: `${reviewDirectory}/${prefix}-${name}-review-failure.png`,
              });
              throw error;
            }
            for (const composer of await page.locator("[data-composer-card]").all())
              await expect(composer).toHaveCSS("opacity", "1");
            await capture(page, { path: `${reviewDirectory}/${prefix}-${name}.png` });
          }
          await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
          const sidebar = page.getByRole("complementary");
          const primaryRows = [
            sidebar.getByRole("button", { name: "Routines", exact: true }),
            sidebar.getByRole("link", { name: "Pages", exact: true }),
            sidebar.getByRole("button", { name: "Tools", exact: true }),
          ];
          const rowGeometry = [];
          for (const row of primaryRows) {
            await expectSurfaceAtRest(page, row);
            rowGeometry.push(
              await row.evaluate((node) => {
                const icon = node.querySelector("svg")!;
                const bounds = node.getBoundingClientRect();
                const glyph = icon.getBoundingClientRect();
                const style = getComputedStyle(node);
                return {
                  width: bounds.width,
                  height: bounds.height,
                  iconX: glyph.x,
                  iconWidth: glyph.width,
                  iconHeight: glyph.height,
                  color: style.color,
                  fontSize: style.fontSize,
                };
              }),
            );
          }
          for (const geometry of rowGeometry.slice(1)) expect(geometry).toEqual(rowGeometry[0]);
          await review("home");
          await page.goto(conversation, { timeout });
          const replyHeading = page.getByText("A clear starting point", { exact: true });
          await expect(replyHeading).toBeVisible();
          await replyHeading.scrollIntoViewIfNeeded({ timeout });
          await review("conversation");
          await openTab(page, "Activity");
          await expect(
            page.getByRole("tabpanel").locator("[data-tool-activity]").first(),
          ).toBeVisible();
          await review("activity");
          await openTab(page, "Conversation");
          const steps = page.getByRole("button", { name: /^\d+ steps?$/ }).first();
          await steps.click({ timeout });
          const toolRow = page.getByRole("tabpanel").locator("[data-tool-call]").first();
          await expect(toolRow).toBeVisible();
          await toolRow.scrollIntoViewIfNeeded({ timeout });
          await review("expanded-steps");
          if (viewport.width >= 768) {
            await page
              .getByRole("button", { name: "Collapse sidebar", exact: true })
              .click({ timeout });
            await review("sidebar-collapsed");
            await page
              .getByRole("button", { name: "Expand sidebar", exact: true })
              .click({ timeout });
          } else {
            await review("sidebar-collapsed");
          }
          await page.goto(`${home}&agentId=${approvalAgent.agent.id}`, { timeout });
          await api.conversations.send({
            ...approvalSelection,
            message: {
              text: `Fixture file write review ${prefix}`,
              idempotencyKey: crypto.randomUUID(),
            },
          });
          await expect.poll(async () => (await api.approvals.pending({ spaceId })).length).toBe(1);
          const approval = page.locator("[data-approval-card]").first();
          await expect(approval).toBeVisible();
          await approval.scrollIntoViewIfNeeded({ timeout });
          await expectSurfaceAtRest(page, approval);
          await review("pending-approval");
          const waiting = (await api.approvals.pending({ spaceId }))[0]!;
          await api.approvals.answer({ spaceId, requestId: waiting.id, decision: "denied" });
          const current = await api.conversations.snapshot(approvalSelection);
          for (const activeRun of current.runs.filter(
            (candidate) => candidate.state === "running" || candidate.state === "waiting",
          ))
            await api.conversations.stop({ ...approvalSelection, runId: activeRun.id });
          await page.goto(`${baseURL}/agents?spaceId=${empty.id}`, { timeout });
          await expect(
            page.getByRole("button", { name: "Create Agent", exact: true }),
          ).toBeVisible();
          await review("empty-space");
          await page.goto(home, { timeout });
          await page.getByRole("button", { name: "Settings", exact: true }).click({ timeout });
          const settings = page.getByRole("dialog", { name: "Settings", exact: true });
          await expectSurfaceAtRest(page, settings);
          await expectSurfaceControls(page, settings);
          await capture(page, { path: `${reviewDirectory}/${prefix}-settings.png` });
        }
      }
    } finally {
      await api.computers.stop({ spaceId });
      await api.spaces.delete({ spaceId });
      await api.spaces.delete({ spaceId: empty.id });
    }
  });
}
