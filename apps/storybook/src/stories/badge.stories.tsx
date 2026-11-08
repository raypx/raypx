import { Badge } from "@raypx/ui/components/ui/badge";
import { StatusBadge } from "@raypx/ui/status-badge";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  args: { children: "Badge", variant: "default" },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline", "ghost", "link"],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="ghost">Ghost</Badge>
      <Badge variant="link">Link</Badge>
    </div>
  ),
};

export const StatusTones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge label="Idle" tone="neutral" />
      <StatusBadge label="Running" tone="info" />
      <StatusBadge label="Awaiting approval" tone="warning" />
      <StatusBadge label="Completed" tone="success" />
      <StatusBadge label="Failed" tone="danger" />
    </div>
  ),
};
