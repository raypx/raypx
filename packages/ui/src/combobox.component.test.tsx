/** @vitest-environment happy-dom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "./components/ui/combobox.js";

type Choice = { value: string; label: string; disabled?: boolean };
const choices = [
  {
    label: "Languages",
    items: [
      { value: "en", label: "English" },
      { value: "zh", label: "简体中文" },
      { value: "unavailable", label: "Unavailable", disabled: true },
    ],
  },
  { label: "Automatic", items: [{ value: "system", label: "Follow device" }] },
];

function Example() {
  const [value, setValue] = useState<Choice | null>(choices[0]!.items[0]!);
  return (
    <form>
      <Combobox<Choice>
        items={choices}
        name="language"
        value={value}
        onValueChange={setValue}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.value}
        isItemEqualToValue={(a, b) => a.value === b.value}
      >
        <ComboboxTrigger aria-label="Language">
          <ComboboxValue />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput aria-label="Find language" placeholder="搜索 / Search" />
          <ComboboxEmpty>No matches</ComboboxEmpty>
          <ComboboxList>
            {(group: (typeof choices)[number]) => (
              <ComboboxGroup key={group.label} items={group.items}>
                <ComboboxLabel>{group.label}</ComboboxLabel>
                <ComboboxCollection>
                  {(item: Choice) => (
                    <ComboboxItem key={item.value} value={item} disabled={item.disabled}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <button type="button">Next field</button>
    </form>
  );
}

afterEach(cleanup);

it("filters grouped options, submits the identity and restores trigger focus on selection", async () => {
  const user = userEvent.setup();
  const { container } = render(<Example />);
  const trigger = screen.getByRole("combobox", { name: "Language" });
  await user.click(trigger);
  const search = screen.getByRole("combobox", { name: "Find language" });
  await waitFor(() => expect(search).toHaveFocus());
  expect(screen.getByRole("option", { name: "Unavailable" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.type(search, "中文");
  expect(screen.queryByRole("option", { name: "English" })).not.toBeInTheDocument();
  await user.keyboard("[ArrowDown][Enter]");
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(trigger).toHaveTextContent("简体中文");
  expect(new FormData(container.querySelector("form")!).get("language")).toBe("zh");
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("reports an empty search and Escape returns to the unchanged selection", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("combobox", { name: "Language" });
  await user.click(trigger);
  await user.type(screen.getByRole("combobox", { name: "Find language" }), "not-a-language");
  expect(screen.getByText("No matches")).toBeVisible();
  expect(screen.queryAllByRole("option")).toHaveLength(0);
  await user.keyboard("[Escape]");
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(trigger).toHaveTextContent("English");
  await waitFor(() => expect(trigger).toHaveFocus());
});
