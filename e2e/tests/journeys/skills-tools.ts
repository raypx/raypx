import { expect as baseExpect, test, type Locator, type Page } from "@playwright/test";
import { createApiClient } from "@raypx/client/api";
import { selectOption } from "../helpers/select.js";
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
async function typeText(input: Locator, value: string) {
  await input.click({ timeout });
  await input.press("ControlOrMeta+A", { timeout });
  await input.pressSequentially(value, { timeout });
}
async function inspectForm(page: Page, form: Locator) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expectSurfaceControls(page, form);
  }
  await page.setViewportSize(viewports[0]!);
  await expectSurfaceAtRest(page, form);
}
function apiFor(page: Page, origin: string, endpoint: string) {
  return createApiClient({
    baseUrl: endpoint,
    headers: { origin },
    fetch: async (input, init) => {
      const response = await page.request.fetch(input, {
        method: init?.method ?? "POST",
        headers: Object.fromEntries(new Headers(init?.headers)),
        ...(typeof init?.body === "string" ? { data: init.body } : {}),
        timeout,
      });
      return new Response(await response.text(), {
        status: response.status(),
        headers: response.headers(),
      });
    },
  });
}

/** The same isolated real-backend journey runs in both compiled renderers. */
export function registerTests() {
  test("creates and enables a skill and remote server, then approves its discovered tool", async ({
    page,
    baseURL,
  }, info) => {
    test.skip(!apiUrl, "Requires the owned backend fixture from bun run test backends --with-e2e");
    if (!apiUrl || !baseURL) return;
    test.setTimeout(120_000);
    const origin = new URL(baseURL).origin;
    const signedIn = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
      headers: { origin },
      data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
      timeout,
    });
    expect(signedIn.status()).toBe(200);
    const api = apiFor(page, origin, apiUrl);
    const suffix = `${info.project.name}-${crypto.randomUUID()}`;
    const { space } = await api.spaces.create({ name: `Skills tools ${suffix}` });
    const spaceId = space.id;
    const skillName = `Research 技能 ${suffix}`;
    const agentName = `Research Agent ${suffix}`;
    const serverName = `Fixture tools ${suffix}`;
    const agentsUrl = `${baseURL}/agents?spaceId=${spaceId}`;
    const desktop = info.project.name === "desktop";
    let skillId: string | undefined;
    let serverId: string | undefined;
    try {
      // An isolated Space exception avoids changing the shared fixture member's default.
      await api.spaces.setApprovalOverride({ spaceId, mode: "ask" });
      await page.setViewportSize(viewports[0]!);
      await page.goto(`${agentsUrl}#${desktop ? "settings" : "settings/skills"}`, { timeout });
      const addSkill = page.getByRole("button", { name: "New skill", exact: true });
      await addSkill.click({ timeout });
      const skillForm = page.getByRole("dialog", { name: "New skill", exact: true });
      await expectSurfaceAtRest(page, skillForm);
      await page.keyboard.press("Escape");
      await expect(skillForm).toBeHidden();
      await expect(addSkill).toBeFocused();
      await addSkill.click({ timeout });
      await expectSurfaceAtRest(page, skillForm);
      await typeText(skillForm.getByRole("textbox", { name: "Name", exact: true }), skillName);
      await typeText(
        skillForm.getByRole("textbox", { name: "Description", exact: true }),
        "Research and compare sources.",
      );
      await typeText(
        skillForm.getByRole("textbox", { name: "Markdown source", exact: true }),
        "# Research\n\nCompare the available sources.",
      );
      await expect(skillForm.getByRole("region", { name: "Preview", exact: true })).toContainText(
        "Compare the available sources.",
      );
      await inspectForm(page, skillForm);
      await skillForm.getByRole("button", { name: "Create skill", exact: true }).click({ timeout });
      await expect(skillForm).toBeHidden();
      skillId = (await api.skills.list({ spaceId, availableOnly: false })).find(
        (skill) => skill.name === skillName,
      )?.id;
      expect(skillId).toBeTruthy();
      await page.goto(agentsUrl, { timeout });
      const newAgent = page.getByRole("button", { name: "New Agent", exact: true });
      await expect(newAgent).toHaveCount(1);
      await expect(page.getByRole("button", { name: "New group", exact: true })).toHaveCount(1);
      await newAgent.click({ timeout });
      const agentForm = page.getByRole("dialog", { name: "New Agent", exact: true });
      await expectSurfaceAtRest(page, agentForm);
      await typeText(agentForm.getByRole("textbox", { name: "Name", exact: true }), agentName);
      await typeText(
        agentForm.getByRole("textbox", { name: "Instructions", exact: true }),
        "Use the selected research skill and remote tools when asked.",
      );
      await selectOption(
        page,
        agentForm.getByRole("combobox", { name: "Model", exact: true }),
        "browser-fixture",
        { timeout },
      );
      await agentForm.getByRole("checkbox", { name: skillName, exact: true }).check({ timeout });
      await inspectForm(page, agentForm);
      await agentForm.getByRole("button", { name: "Create Agent", exact: true }).click({ timeout });
      await expect(agentForm).toBeHidden();
      await expect(page.locator("[data-conversation-header] h1")).toHaveText(agentName);
      const agent = (await api.agents.list({ spaceId, limit: 100 })).find(
        ({ agent: entry }) => entry.name === agentName,
      )?.agent;
      expect(agent).toBeTruthy();
      if (!agent) throw new Error("Created Agent missing from the authoritative directory");
      expect(
        (await api.skills.agentSkills({ spaceId, agentId: agent.id })).map(({ id }) => id),
      ).toContain(skillId);

      await page.goto(`${agentsUrl}#${desktop ? "settings" : "settings/tools"}`, { timeout });
      const addServer = page.getByRole("button", { name: "Add server", exact: true });
      await addServer.click({ timeout });
      const serverForm = page.getByRole("dialog", { name: "Add server", exact: true });
      await expectSurfaceAtRest(page, serverForm);
      await typeText(serverForm.getByRole("textbox", { name: "Name", exact: true }), serverName);
      await typeText(
        serverForm.getByRole("textbox", { name: "Server URL", exact: true }),
        `${apiUrl}/fixture/mcp`,
      );
      await expect(
        serverForm.getByRole("textbox", { name: "Credential headers (optional)", exact: true }),
      ).toHaveValue("");
      await inspectForm(page, serverForm);
      await serverForm.getByRole("button", { name: "Save", exact: true }).click({ timeout });
      await expect(serverForm).toBeHidden();
      serverId = (await api.mcpServers.list({})).find((server) => server.name === serverName)?.id;
      expect(serverId).toBeTruthy();
      const serverRow = page
        .getByRole("listitem")
        .filter({ has: page.getByText(serverName, { exact: true }) });
      await serverRow.getByRole("button", { name: "Test", exact: true }).click({ timeout });
      await expect(serverRow.getByRole("status")).toHaveText("Connected");
      await expect(
        serverRow.getByRole("list", { name: "Discovered tools", exact: true }),
      ).toContainText("fixture_echo");

      await page.goto(`${agentsUrl}&agentId=${agent.id}`, { timeout });
      await expect(page.locator("[data-conversation-header] h1")).toHaveText(agentName);
      await page
        .getByRole("button", { name: `Actions for ${agentName}`, exact: true })
        .click({ timeout });
      await page.getByRole("menuitem", { name: "Edit Agent", exact: true }).click({ timeout });
      const editAgent = page.getByRole("dialog", { name: "Edit Agent", exact: true });
      await expectSurfaceAtRest(page, editAgent);
      await expect(editAgent.getByRole("checkbox", { name: skillName, exact: true })).toBeChecked();
      await editAgent.getByRole("checkbox", { name: serverName, exact: true }).check({ timeout });
      await inspectForm(page, editAgent);
      await editAgent.getByRole("button", { name: "Save", exact: true }).click({ timeout });
      await expect(editAgent).toBeHidden();
      expect(await api.mcpServers.enabled({ spaceId, agentId: agent.id })).toContain(serverId);
      const editor = page.getByRole("textbox", { name: "Message", exact: true });
      await typeText(editor, `Fixture MCP call ${suffix}`);
      await page.getByRole("button", { name: "Send", exact: true }).click({ timeout });
      const dynamicLabel = `MCP ${serverId!.replaceAll("-", "").slice(0, 32)} / fixture echo`;
      const approval = page
        .locator("[data-approval-card]")
        .filter({ has: page.getByRole("heading", { name: dynamicLabel, exact: true }) });
      await expect(approval).toBeVisible();
      await approval.getByRole("button", { name: "Approve", exact: true }).click({ timeout });
      await expect(approval).toBeHidden();
      const activity = page
        .locator("[data-tool-activity]")
        .filter({ has: page.getByRole("button", { name: /Used 1 tool/ }) });
      await activity.getByRole("button", { name: /Used 1 tool/ }).click({ timeout });
      const toolRow = activity.locator("[data-tool-call]");
      await expect(toolRow).toContainText(dynamicLabel);
      await expect(toolRow).toHaveAttribute("data-tool-outcome", "succeeded");
    } finally {
      const cleanup = await Promise.allSettled([
        ...(skillId ? [api.skills.delete({ spaceId, id: skillId })] : []),
        ...(serverId ? [api.mcpServers.delete({ id: serverId })] : []),
      ]);
      await api.spaces.delete({ spaceId });
      for (const result of cleanup) expect(result.status).toBe("fulfilled");
    }
  });
}
