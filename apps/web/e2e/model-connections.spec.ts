import { expect, test } from "@playwright/test";

const apiUrl = process.env.CONTROL_E2E_API_URL;

test(
  "Member model connections can be tested, edited, selected and deleted",
  { tag: "@web" },
  async ({ page }) => {
    test.skip(!apiUrl, "Requires the owned backend fixture from bun run test backends --with-e2e");
    const name = `Member model ${crypto.randomUUID()}`;
    const editedName = `${name} edited`;
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("http://127.0.0.1:4173/agents");
    await page.getByLabel("Email address", { exact: true }).fill("control-e2e@example.com");
    await page.getByLabel("Password", { exact: true }).fill("Raypx-control-test-123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/agents(?:\?|$)/);
    await page.goto("http://127.0.0.1:4173/agents#settings/models");
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("button", { name: "Add model connection", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Add model connection", exact: true });
    await form.getByLabel("Name", { exact: true }).fill(name);
    await form.getByRole("combobox", { name: "Kind", exact: true }).click();
    await page.getByRole("option", { name: "Compatible endpoint", exact: true }).click();
    await form.getByLabel("Endpoint URL", { exact: true }).fill("https://fixture.invalid/v1");
    await form.getByLabel("Offered models", { exact: true }).fill("fixture-member-model");
    await form.getByLabel("API key", { exact: true }).fill("fixture-member-write-only-key");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(settings.getByText(name, { exact: true })).toBeVisible();
    await expect(settings).not.toContainText("fixture-member-write-only-key");
    await settings.getByRole("button", { name: `Test ${name}`, exact: true }).click();
    await expect(settings.getByRole("status")).toHaveText("Connection succeeded");
    await settings.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit model connection", exact: true });
    await expect(edit.getByLabel("API key", { exact: true })).toHaveValue("");
    await expect(
      edit.getByText("Leave empty to keep the current key.", { exact: true }),
    ).toBeVisible();
    await edit.getByLabel("Name", { exact: true }).fill(editedName);
    await edit.getByRole("button", { name: "Save", exact: true }).click();
    await expect(edit).toHaveCount(0);
    await settings.getByRole("button", { name: `Test ${editedName}`, exact: true }).click();
    await expect(settings.getByRole("status")).toHaveText("Connection succeeded");
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: /^(?:New Agent|Create Agent)$/, exact: true }).click();
    const agent = page.getByRole("dialog", { name: "New Agent", exact: true });
    await agent.getByRole("combobox", { name: "Model", exact: true }).click();
    await expect(page.getByText("Your connections", { exact: true })).toBeVisible();
    await expect(page.getByText("Server models", { exact: true })).toBeVisible();
    await page
      .getByRole("option", { name: `${editedName} / fixture-member-model`, exact: true })
      .click();
    await expect(agent.getByRole("combobox", { name: "Model", exact: true })).toHaveText(
      `${editedName} / fixture-member-model`,
    );
    await agent.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.goto("http://127.0.0.1:4173/agents#settings/models");
    await settings.getByRole("button", { name: `Delete ${editedName}`, exact: true }).click();
    const deletion = page.getByRole("alertdialog", { name: `Delete ${editedName}?`, exact: true });
    await expect(
      deletion.getByText("Runs pinned to this connection will fail to resume.", { exact: true }),
    ).toBeVisible();
    await deletion.getByRole("button", { name: "Delete connection", exact: true }).click();
    await expect(settings.getByText(editedName, { exact: true })).toHaveCount(0);
  },
);
