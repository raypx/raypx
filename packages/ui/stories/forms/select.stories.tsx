import { useId, useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Label } from "../../src/components/label.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/components/select.js";

function SelectExample(args: ComponentProps<typeof Select>) {
  const id = useId();
  const [selection, setSelection] = useState({ value: args.value ?? "", source: args.value });
  if (selection.source !== args.value) {
    setSelection({ value: args.value ?? "", source: args.value });
  }
  const { value } = selection;
  return (
    <div className="grid w-80 max-w-full gap-2">
      <Label htmlFor={id}>Digest frequency</Label>
      <Select
        {...args}
        value={value}
        onValueChange={(nextValue) => {
          setSelection({ value: nextValue, source: args.value });
          args.onValueChange?.(nextValue);
        }}
      >
        <SelectTrigger id={id} aria-label="Digest frequency">
          <SelectValue placeholder="Choose a frequency" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="daily">Daily</SelectItem>
          <SelectItem value="weekly">Weekly</SelectItem>
          <SelectItem value="monthly">Monthly</SelectItem>
        </SelectContent>
      </Select>
      <output aria-label="Selected frequency" className="text-sm text-muted-foreground">
        Selected: {value || "none"}
      </output>
    </div>
  );
}

const meta = {
  title: "Forms/Select",
  component: Select,
  tags: ["autodocs"],
  args: { value: "weekly", disabled: false, onValueChange: fn<(value: string) => void>() },
  argTypes: {
    value: { control: "select", options: ["daily", "weekly", "monthly"] },
    disabled: { control: "boolean" },
    onValueChange: { control: false },
    children: { control: false },
  },
  render: function Render() {
    const [args, updateArgs] = useArgs<ComponentProps<typeof Select>>();
    return (
      <SelectExample
        {...args}
        onValueChange={(value) => {
          updateArgs({ value });
          args.onValueChange?.(value);
        }}
      />
    );
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Controlled: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Empty: Story = { args: { value: "" } };
export const KeyboardSelection: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox", { name: "Digest frequency" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    const portal = within(canvasElement.ownerDocument.body);
    const weekly = await portal.findByRole("option", { name: "Weekly" });
    await waitFor(() => expect(weekly).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(portal.getByRole("option", { name: "Monthly" })).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    await expect(args.onValueChange).toHaveBeenCalledWith("monthly");
    await waitFor(() => expect(trigger).toHaveTextContent("Monthly"));
    const status = await canvas.findByRole("status", { name: "Selected frequency" });
    await expect(status).toHaveTextContent("Selected: monthly");
  },
};
