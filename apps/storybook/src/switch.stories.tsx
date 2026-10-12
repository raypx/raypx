import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Switch } from "@voidmix/ui/components/ui/switch";

const meta = {
  title: "Primitives/Switch",
  component: Switch,
  tags: ["autodocs"],
  args: {
    "aria-label": "Sync automatically",
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = { args: { checked: true } };

export const Disabled: Story = { args: { disabled: true } };

export const Interactive: Story = {
  render: (args) => {
    const [checked, setChecked] = useState(false);
    return <Switch {...args} checked={checked} onCheckedChange={setChecked} />;
  },
};
