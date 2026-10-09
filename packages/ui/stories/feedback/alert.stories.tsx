import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { CircleAlert, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../src/components/alert.js";

type AlertArgs = ComponentProps<typeof Alert> & { heading: string; description: string };

const meta = {
  title: "Feedback/Alert",
  component: Alert,
  tags: ["autodocs"],
  args: {
    variant: "default",
    heading: "Workspace ready",
    description: "Your workspace is ready for its first project.",
  },
  argTypes: {
    variant: { control: "select", options: ["default", "destructive"] },
    heading: { control: "text" },
    description: { control: "text" },
    children: { control: false },
  },
  render: ({ heading, description, ...args }) => (
    <Alert {...args} className="w-full max-w-lg">
      {args.variant === "destructive" ? (
        <CircleAlert aria-hidden="true" />
      ) : (
        <Info aria-hidden="true" />
      )}
      <AlertTitle>{heading}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  ),
} satisfies Meta<AlertArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Information: Story = {};
export const Destructive: Story = {
  args: {
    variant: "destructive",
    heading: "Changes could not be saved",
    description: "Your edits are still available. Try saving again when the connection returns.",
  },
};
export const LongContent: Story = {
  args: {
    heading: "A teammate updated this project",
    description:
      "Review the latest changes before you continue. Your local draft is preserved, so you can copy any unsaved notes into the updated version.",
  },
};
