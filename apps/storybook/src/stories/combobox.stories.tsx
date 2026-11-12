import type { Meta, StoryObj } from "@storybook/react-vite";
import { useId, useState } from "react";
import { expect, waitFor, within } from "storybook/test";
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
} from "@raypx/ui/components/ui/combobox";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";

const meta = { title: "Primitives/Combobox" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

type Choice = { value: string; label: string; disabled?: boolean };
type ChoiceGroup = { label: string; items: Choice[] };
const chinese: Choice = { value: "zh", label: "简体中文" };
const groups: ChoiceGroup[] = [
  {
    label: "语言 / Languages",
    items: [
      chinese,
      { value: "en", label: "English" },
      { value: "unavailable", label: "未配置 / Not configured", disabled: true },
    ],
  },
  { label: "设备 / Device", items: [{ value: "auto", label: "跟随设备 / Follow device" }] },
];

function GroupedSearchExample() {
  const id = useId();
  const [value, setValue] = useState<Choice | null>(chinese);
  return (
    <Field className="w-64 max-w-full">
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        语言 / Language
      </FieldLabel>
      <Combobox<Choice>
        items={groups}
        value={value}
        onValueChange={setValue}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.value}
        isItemEqualToValue={(a, b) => a.value === b.value}
      >
        <ComboboxTrigger id={id} aria-labelledby={`${id}-label`} className="w-full">
          <span className="min-w-0 truncate">
            <ComboboxValue />
          </span>
        </ComboboxTrigger>
        <ComboboxContent aria-labelledby={`${id}-label`}>
          <ComboboxInput aria-label="搜索语言 / Find language" placeholder="搜索 / Search" />
          <ComboboxEmpty>没有匹配项 / No matches</ComboboxEmpty>
          <ComboboxList>
            {(group: ChoiceGroup) => (
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
    </Field>
  );
}

export const GroupedSearch: Story = { render: () => <GroupedSearchExample /> };

export const KeyboardSelection: Story = {
  ...GroupedSearch,
  play: async ({ canvas, canvasElement, userEvent, step }) => {
    const trigger = canvas.getByRole("combobox", { name: /^语言 \/ Language$/ });
    const popup = within(canvasElement.ownerDocument.body);

    await step("Open with the keyboard and inspect the groups", async () => {
      trigger.focus();
      await userEvent.keyboard("{Enter}");
      const dialog = await popup.findByRole("dialog", { name: /^语言 \/ Language$/ });
      const list = within(dialog).getByRole("listbox");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(trigger).toHaveAttribute("aria-controls", dialog.id);
      await expect(within(dialog).getByRole("combobox", { name: /Find language/ })).toHaveAttribute(
        "aria-controls",
        list.id,
      );
      const group = within(list).getByRole("group", { name: "设备 / Device" });
      await waitFor(() => expect(group).toBeVisible());
      await expect(popup.getByRole("option", { name: /Not configured/ })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    await step("Filter, highlight and commit a choice", async () => {
      const search = popup.getByRole("combobox", { name: /Find language/ });
      await waitFor(() => expect(search).toHaveFocus());
      await userEvent.type(search, "English");
      const option = popup.getByRole("option", { name: /^English$/ });
      await expect(popup.getAllByRole("option")).toEqual([option]);
      await userEvent.keyboard("{ArrowDown}");
      await expect(search).toHaveAttribute("aria-activedescendant", option.id);
      await userEvent.keyboard("{Enter}");
      await waitFor(() => expect(trigger).toHaveTextContent("English"));
      await waitFor(() => expect(trigger).toHaveFocus());
    });

    await step("Escape from an empty search keeps the selection", async () => {
      await userEvent.keyboard("{Enter}");
      const search = await popup.findByRole("combobox", { name: /Find language/ });
      await userEvent.type(search, "absent");
      await expect(popup.getByText(/No matches/)).toBeVisible();
      await userEvent.keyboard("{Escape}");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(trigger).toHaveTextContent("English");
      await waitFor(() => expect(trigger).toHaveFocus());
    });
  },
};
