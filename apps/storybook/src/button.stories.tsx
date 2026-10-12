import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@voidmix/ui/components/ui/button";

const meta = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
  args: {
    children: "Continue",
    variant: "default",
    size: "default",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: {
    children: "Review details",
    variant: "secondary",
  },
};

export const Destructive: Story = {
  args: {
    children: "Delete account",
    variant: "destructive",
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    children: "Unavailable",
    disabled: true,
  },
};
