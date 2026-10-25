import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

export async function selectOption(name: string, value: string) {
  const user = userEvent.setup();
  const trigger = screen.getByRole("combobox", { name });
  await user.click(trigger);
  const options = await screen.findAllByRole("option");
  const option = options.find((item) => item.getAttribute("data-value") === value);
  if (!option) throw new Error(`Missing select option: ${value}`);
  const label = option.textContent;
  await waitFor(() => {
    if (!option.isConnected || option.closest('[aria-hidden="true"]'))
      throw new Error("Select is not ready");
  });
  await user.click(option);
  await waitFor(() => {
    if (
      !label ||
      !trigger.textContent?.includes(label) ||
      trigger.getAttribute("aria-expanded") === "true"
    )
      throw new Error(`Select did not accept ${value}`);
  });
}
