import { expect, test } from "@playwright/test";
import { capture } from "../helpers/capture.js";
import { ownedApi } from "../helpers/owned-api.js";
import { openConversationCapability } from "../helpers/conversation-header.js";
import { authResponse } from "../helpers/account-fixture.js";

const endpoint = process.env.CONTROL_E2E_API_URL;

/** Safe, explicit review points. Pairing codes and issued invitation/share links stay excluded. */
export function registerTests() {
  test.use({ trace: "off", video: "off", screenshot: "off", reducedMotion: "reduce" });
  test("reviews settings, editors and resource directories", async ({ page, baseURL }, info) => {
    test.skip(
      !endpoint || !process.env.RAYPX_PAGE_REVIEW_PHASE,
      "Opt-in page review with owned API",
    );
    if (!endpoint || !baseURL) return;
    test.setTimeout(240_000);
    page.setDefaultTimeout(5_000);
    const origin = new URL(baseURL).origin;
    const login = await page.request.post(`${endpoint}/api/auth/sign-in/email`, {
      headers: { origin },
      data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
    });
    expect(login.status()).toBe(200);
    const api = ownedApi(page, origin, endpoint);
    const { space } = await api.spaces.create({ name: "Design review workspace" });
    const { agent } = await api.agents.create({
      spaceId: space.id,
      agent: {
        name: "Research partner · planning a thoughtful next step together",
        instructions: "Review fixture. Do not execute tools.",
        model: { modelId: "browser-fixture" },
      },
    });
    const { agent: second } = await api.agents.create({
      spaceId: space.id,
      agent: {
        name: "Writing partner",
        instructions: "Review fixture. Do not execute tools.",
        model: { modelId: "browser-fixture" },
      },
    });
    const group = await api.conversations.createGroup({
      spaceId: space.id,
      name: "Planning together · a shared conversation with a long title",
      agentIds: [agent.id, second.id],
    });
    await api.pages.create({
      spaceId: space.id,
      page: {
        title: "Working notes · a shared document",
        kind: "document",
        body: "# Working notes\n\nA clear next step.\n\n- Review the plan\n- Discuss it together",
        agentId: agent.id,
      },
    });
    const home = `${baseURL}/agents?spaceId=${space.id}`;
    const conversation = `${home}&agentId=${agent.id}`;
    async function review(name: string) {
      await capture(page, { path: info.outputPath(`${name}.png`), fullPage: true });
    }
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(home);
      await expect(page.locator("[data-workspace-home]")).toBeVisible();
      await review("home-directory-long-names");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await review("search");
      await page.keyboard.press("Escape");
      // The feed is cross-Space; isolate its empty presentation from other journeys' Runs.
      await page.route("**/rpc/notifications/list", (route) =>
        authResponse(route, { json: { items: [], truncated: false } }),
      );
      await page.getByRole("button", { name: "Notifications", exact: true }).click();
      await expect(page.getByText("You’re all caught up.", { exact: true })).toBeVisible();
      await review("notifications-empty");
      await page.keyboard.press("Escape");
      await page.unroute("**/rpc/notifications/list");
      await page.getByRole("button", { name: "New Agent", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "New Agent", exact: true })).toBeVisible();
      await review("agent-create");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "New group", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "New group", exact: true })).toBeVisible();
      await review("group-create");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Space", exact: true }).click();
      await page.getByRole("menuitem", { name: "Space settings", exact: true }).click();
      const settings = page.getByRole("dialog", { name: "Space settings", exact: true });
      for (const value of ["general", "members", "invitations", "approvals", "devices", "audit"]) {
        const row = settings.locator(`button[data-value="${value}"]`);
        if (await row.isVisible()) await row.click();
        else {
          await settings.getByRole("combobox", { name: "Section", exact: true }).click();
          await page
            .getByRole("option")
            .and(page.locator(`[data-value="${value}"]`))
            .click();
        }
        await review(`space-${value}`);
      }
      await page.keyboard.press("Escape");
      for (const section of [
        "account",
        "preferences",
        "models",
        "skills",
        "tools",
        "diagnostics",
      ]) {
        if (info.project.name === "desktop" && section === "account") {
          await page.goto(`${baseURL}/account`);
          await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
        } else {
          await page.goto(`${home}#settings/${section}`);
          await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
        }
        await review(`account-${section}`);
        if (section === "skills") {
          await page.getByRole("button", { name: "New skill", exact: true }).click();
          await expect(page.getByRole("dialog", { name: "New skill", exact: true })).toBeVisible();
          await review("skill-create");
          await page.keyboard.press("Escape");
        }
        if (section === "models") {
          await page.getByRole("button", { name: "Add model connection", exact: true }).click();
          await expect(
            page.getByRole("dialog", { name: "Add model connection", exact: true }),
          ).toBeVisible();
          await review("model-connection-create");
          await page.keyboard.press("Escape");
        }
        if (section === "tools") {
          await page.getByRole("button", { name: "Add server", exact: true }).click();
          await expect(page.getByRole("dialog", { name: "Add server", exact: true })).toBeVisible();
          await review("remote-server-create");
          await page.keyboard.press("Escape");
        }
      }
      await page.goto(`${baseURL}/pages?spaceId=${space.id}`);
      await expect(
        page.getByText("Working notes · a shared document", { exact: true }),
      ).toBeVisible();
      await review("pages-directory");
      await page.goto(conversation);
      await expect(page.locator("[data-conversation-header]")).toBeVisible();
      await review("conversation-empty");
      await page.goto(`${home}&groupId=${group.id}`);
      await expect(page.locator("[data-conversation-header] h1")).toHaveText(group.name!);
      await review("group-conversation-empty");
      await page.getByRole("button", { name: "Participants", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Participants", exact: true })).toBeVisible();
      await review("group-participants");
      await page.keyboard.press("Escape");
      await page.goto(conversation);
      await openConversationCapability(page, "Routines");
      await expect(page.getByRole("dialog", { name: "Routines", exact: true })).toBeVisible();
      await review("routines-directory");
      await page.keyboard.press("Escape");
      await openConversationCapability(page, "Memory");
      await expect(page.getByRole("dialog", { name: "Memory", exact: true })).toBeVisible();
      await review("memory-directory");
      await page.keyboard.press("Escape");
      for (const reason of ["SPACE_RUNNING_LIMIT", "SPACE_DAILY_TRANSFER_LIMIT"]) {
        await page.route("**/rpc/computers/get", (route) =>
          authResponse(route, {
            json: { status: "available", computer: null, unavailableReason: reason },
          }),
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(conversation);
        await page.getByRole("button", { name: /^Computer:/ }).click();
        await review(`computer-${reason.toLowerCase()}`);
        await page.unroute("**/rpc/computers/get");
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      let release = () => {};
      const waiting = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/rpc/spaces/list", async (route) => {
        await waiting;
        await authResponse(route, { json: [] });
      });
      await page.goto(home, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#main").getByText("Loading…", { exact: true })).toBeVisible();
      await review("workspace-loading");
      release();
      await expect(
        page.getByRole("heading", { name: "Create a Space to get started.", exact: true }),
      ).toBeVisible();
      await review("workspace-no-space");
      await page.unroute("**/rpc/spaces/list");
      await page.route("**/rpc/spaces/list", (route) =>
        authResponse(
          route,
          { json: { defined: false, code: "INTERNAL_SERVER_ERROR", message: "Unavailable" } },
          503,
        ),
      );
      await page.goto(home);
      await expect(page.locator("#main").getByRole("alert").first()).toBeVisible();
      await review("workspace-error-retry");
      await page.unroute("**/rpc/spaces/list");
      await page.goto(`${baseURL}/join`);
      await expect(page.getByRole("main")).toBeVisible();
      await review("invitation-invalid");
      await page.goto(`${baseURL}/missing-page`);
      await expect(page.getByRole("main")).toBeVisible();
      await review("not-found");
    } finally {
      await api.spaces.delete({ spaceId: space.id });
    }
  });
}
