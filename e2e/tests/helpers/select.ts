import { expect, type Locator, type Page } from "@playwright/test";

export async function selectOption(
  page: Page,
  trigger: Locator,
  value: string,
  options: { timeout?: number } = {},
) {
  await trigger.click(options);
  const option = page
    .getByRole("option")
    .and(page.locator(`[data-value=${JSON.stringify(value)}]`));
  const label = await option.innerText(options);
  await option.click(options);
  await expect(trigger).toContainText(label, options);
  await expect(trigger).toHaveAttribute("aria-expanded", "false", options);
}

/** Settings uses labelled rows on wide screens and the same choices in a narrow Select. */
export async function selectSettingsSection(page: Page, settings: Locator, value: string) {
  const navigation = settings.getByRole("navigation", { name: "Section", exact: true });
  const row = navigation.locator(`button[data-value=${JSON.stringify(value)}]`);
  if (await row.isVisible()) {
    await row.click({ timeout: 5_000 });
    await expect(row).toHaveAttribute("aria-current", "page");
  } else {
    await selectOption(
      page,
      settings.getByRole("combobox", { name: "Section", exact: true }),
      value,
      { timeout: 5_000 },
    );
  }
}
