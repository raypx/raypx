import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "@voidmix/ui/components/ui/badge";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  tags: ["autodocs"],
  args: {
    children: "Active",
    variant: "secondary",
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Positive: Story = {};

export const Warning: Story = {
  args: {
    children: "Needs review",
    variant: "destructive",
  },
};

export const Neutral: Story = {
  args: {
    children: "Draft",
    variant: "outline",
  },
};

export const AllTones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">Neutral</Badge>
      <Badge variant="secondary">Positive</Badge>
      <Badge variant="destructive">Warning</Badge>
      <Badge variant="default">Accent</Badge>
    </div>
  ),
};
