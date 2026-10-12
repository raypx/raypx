import { LoadingState } from "@voidmix/ui/loading-state";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "@voidmix/ui/empty-state";
import { Button } from "@voidmix/ui/components/ui/button";
import { StatusBadge } from "@voidmix/ui/status-badge";

const meta = {
  title: "Patterns/States",
  component: EmptyState,
  tags: ["autodocs"],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    title: "No projects yet",
    description: "Create a project to keep related work together.",
    action: <Button>Create project</Button>,
  },
};

export const Statuses: Story = {
  args: {
    title: "Status",
    description: "Common execution states.",
  },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge label="Queued" />
      <StatusBadge label="Running" tone="info" />
      <StatusBadge label="Blocked" tone="danger" />
      <StatusBadge label="Complete" tone="success" />
    </div>
  ),
};

export const Loading: Story = {
  args: { title: "Loading", description: "Preserve the page layout while data loads." },
  render: () => <LoadingState label="Loading your projects…" />,
};
export const Unavailable: Story = {
  args: {
    title: "Overview is not available",
    description: "The service is reachable, but overview data is not available.",
  },
};
