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
