import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "../../src/components/button.js";
import { EmptyState, type EmptyStateProps } from "../../src/components/empty-state.js";

const meta = {
  title: "Feedback/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
  args: {
    title: "No projects yet",
    description: "Create a project to organize your notes.",
    className: "w-full max-w-lg",
  },
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
    action: { control: false },
    icon: { control: false },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyCollection: Story = {};
export const NoSearchResults: Story = {
  args: {
    title: "No matching projects",
    description: "Try a different project name or remove a filter.",
    icon: <Search />,
  },
};

function CreateProjectExample(args: EmptyStateProps) {
  const [created, setCreated] = useState(false);
  return (
    <EmptyState
      {...args}
      title={created ? "First project created" : args.title}
      description={
        created ? "Your example project is ready. No data was sent to a server." : args.description
      }
      action={
        created ? undefined : <Button onClick={() => setCreated(true)}>Create project</Button>
      }
    />
  );
}

export const WithAction: Story = {
  render: (args) => <CreateProjectExample {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Create project" }));
    await expect(
      canvas.findByRole("region", { name: "First project created" }),
    ).resolves.toBeVisible();
  },
};
