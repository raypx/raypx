import { expect } from "@playwright/test";
import {
  authResponse,
  connectedProject,
  signedInAccount,
  test,
  webShellFixture,
} from "@raypx/e2e/testing";

test("finds a remote task project with Combobox and keeps model selection device-local", async ({
  page,
  base,
}) => {
  const deviceId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  await webShellFixture(page);
  await signedInAccount(page);
  await connectedProject(page, deviceId, projectId);
  await page.route("**/rpc/tasks/list", (route) => authResponse(route, { json: [] }));
  await page.goto(base + "/projects");

  const trigger = page.getByRole("button", { name: "Search", exact: true });
  const palette = page.getByRole("dialog", { name: "Search", exact: true });
  const search = palette.getByRole("combobox", { name: "Search", exact: true });
  await trigger.click();
  await expect(search).toBeFocused();
  await search.fill("missing project");
  await expect(palette.getByText("No results", { exact: true })).toBeVisible();
  await search.press("Escape");
  await expect(palette).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(base + "/projects");

  await trigger.press("Enter");
  await search.fill("Ｄｅｖｅｌｏｐｍｅｎｔ Ｍａｃ");
  const project = palette.getByRole("option", { name: /Raypx.*Development Mac/ });
  await expect(project).toBeVisible();
  await search.press("ArrowDown");
  await expect(search).toHaveAttribute(
    "aria-activedescendant",
    (await project.getAttribute("id")) ?? "",
  );
  await search.press("Enter");
  await expect(palette).toBeHidden();
  await expect(page).toHaveURL(/\/tasks\?/);
  expect(new URL(page.url()).searchParams.get("project")).toBe(projectId);

  await page.getByRole("button", { name: "New session", exact: true }).click();
  const form = page.getByRole("form", { name: "New session", exact: true });
  const agent = form.getByRole("combobox", { name: "Agent", exact: true });
  await expect(agent).toBeVisible();
  await agent.click();
  await expect(page.getByRole("option", { name: "Codex", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Pi", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(form.getByRole("combobox", { name: "Model", exact: true })).toHaveCount(0);
});
