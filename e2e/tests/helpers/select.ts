import { expect, type Locator, type Page } from "@playwright/test";

export async function selectOption(page: Page, trigger: Locator, value: string) {
  await trigger.click();
  const option = page
    .getByRole("option")
    .and(page.locator(`[data-value=${JSON.stringify(value)}]`));
  const label = await option.innerText();
  await option.click();
  await expect(trigger).toContainText(label);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}
