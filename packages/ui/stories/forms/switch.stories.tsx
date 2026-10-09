import { useId, useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, fn, userEvent, within } from "storybook/test";
import { Label } from "../../src/components/label.js";
import { Switch } from "../../src/components/switch.js";

function SwitchExample(args: ComponentProps<typeof Switch>) {
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
        <Switch
          {...args}
          id={id}
          checked={checked}
          onCheckedChange={(nextChecked) => {
            setSelection({ checked: nextChecked, source: args.checked });
            args.onCheckedChange?.(nextChecked);
          }}
        />
        <Label htmlFor={id}>Email notifications</Label>
      </div>
      <p className="text-sm text-muted-foreground">
        Notifications {checked ? "enabled" : "disabled"}
      </p>
    </div>
  );
}

const meta = {
  title: "Forms/Switch",
  component: Switch,
  tags: ["autodocs"],
  args: { checked: false, disabled: false, onCheckedChange: fn<(checked: boolean) => void>() },
  argTypes: {
    checked: { control: "boolean" },
    disabled: { control: "boolean" },
    onCheckedChange: { control: false },
    children: { control: false },
  },
  render: function Render() {
    const [args, updateArgs] = useArgs<ComponentProps<typeof Switch>>();
    return (
      <SwitchExample
        {...args}
        onCheckedChange={(checked) => {
          updateArgs({ checked });
          args.onCheckedChange?.(checked);
        }}
      />
    );
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("switch", { name: "Email notifications" });
    await expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await expect(toggle).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true);
  },
};
export const On: Story = { args: { checked: true } };
export const DisabledOff: Story = { args: { disabled: true } };
export const DisabledOn: Story = { args: { disabled: true, checked: true } };
