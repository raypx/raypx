import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

export async function selectOption(name: string, value: string) {
  const user = userEvent.setup();
  let label = "";
  await waitFor(
    async () => {
      const trigger = screen.getByRole("combobox", { name });
      const accepted = () =>
        label &&
        trigger.querySelector('[data-slot="select-value"]')?.textContent?.trim() === label &&
        trigger.getAttribute("aria-expanded") !== "true";
      if (accepted()) return;
      if (trigger.getAttribute("aria-expanded") !== "true") {
        trigger.focus();
        await user.keyboard("{ArrowDown}");
      }
      const option = screen
        .getAllByRole("option")
        .find((item) => item.getAttribute("data-value") === value);
      if (!option || !option.isConnected || option.closest('[aria-hidden="true"]'))
        throw new Error("Select is not ready");
      label = option.textContent?.trim() ?? "";
      await user.click(option);
      if (!accepted()) throw new Error(`Select did not accept ${value}`);
    },
    // Controlled selections may reject once and need reopening on busy CI runners.
    { timeout: 3_000 },
  );
}
