import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../../src/components/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../src/components/card.js";

const meta = {
  title: "Primitives/Card",
  component: Card,
  args: { className: "w-full max-w-md" },
  argTypes: { className: { control: "text" }, children: { control: false } },
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg">Workspace access</h2>
        </CardTitle>
        <CardDescription>Choose who can view projects in this workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          Only invited members have access. You can update individual project permissions at any
          time.
        </p>
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <Button>Manage members</Button>
        <Button variant="outline">View permissions</Button>
      </CardFooter>
    </Card>
  ),
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Workspace: Story = {};
export const ContentOnly: Story = {
  render: (args) => (
    <Card {...args}>
      <CardContent className="pt-6">
        <p className="text-sm">Your workspace is available to all invited members.</p>
      </CardContent>
    </Card>
  ),
};
export const LongContent: Story = {
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg break-words">
            Access settings for a shared workspace with a longer descriptive name
          </h2>
        </CardTitle>
        <CardDescription>
          Review membership and permissions before inviting collaborators from another team.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm break-words">
          A workspace groups related projects. Members can belong to more than one workspace, and
          changing this workspace does not affect their permissions elsewhere.
        </p>
      </CardContent>
    </Card>
  ),
};
