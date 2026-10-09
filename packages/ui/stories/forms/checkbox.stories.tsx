import { useId, useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, fn, userEvent, within } from "storybook/test";
import { Checkbox } from "../../src/components/checkbox.js";
import { Label } from "../../src/components/label.js";

function CheckboxExample(args: ComponentProps<typeof Checkbox>) {
  const id = useId();
  const [selection, setSelection] = useState({
    checked: args.checked ?? false,
    source: args.checked,
  });
  if (selection.source !== args.checked) {
    setSelection({ checked: args.checked ?? false, source: args.checked });
  }
  const { checked } = selection;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Checkbox
          {...args}
          id={id}
          checked={checked}
          onCheckedChange={(nextChecked) => {
            setSelection({ checked: nextChecked, source: args.checked });
            args.onCheckedChange?.(nextChecked);
          }}
        />
        <Label htmlFor={id}>Include archived projects</Label>
      </div>
      <p className="text-sm text-muted-foreground">
        {checked === "indeterminate" ? "Partially selected" : checked ? "Selected" : "Not selected"}
      </p>
    </div>
  );
}

const meta = {
  title: "Forms/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  args: {
    checked: false,
    disabled: false,
    onCheckedChange: fn<(checked: boolean | "indeterminate") => void>(),
  },
  argTypes: {
    checked: { control: "radio", options: [false, true, "indeterminate"] },
    disabled: { control: "boolean" },
    onCheckedChange: { control: false },
    children: { control: false },
  },
  render: function Render() {
    const [args, updateArgs] = useArgs<ComponentProps<typeof Checkbox>>();
    return (
      <CheckboxExample
        {...args}
        onCheckedChange={(checked) => {
          updateArgs({ checked });
          args.onCheckedChange?.(checked);
        }}
      />
    );
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole("checkbox", { name: "Include archived projects" });
    await expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    await expect(checkbox).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true);
  },
};
export const Checked: Story = { args: { checked: true } };
export const Indeterminate: Story = { args: { checked: "indeterminate" } };
export const Disabled: Story = { args: { disabled: true } };
export const DisabledChecked: Story = { args: { disabled: true, checked: true } };
