import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../src/components/alert.js";
import { Button } from "../../src/components/button.js";
import { ErrorState, type ErrorStateProps } from "../../src/components/error-state.js";

const meta = {
  title: "Feedback/ErrorState",
  component: ErrorState,
  tags: ["autodocs"],
  args: {
    title: "Could not load projects",
    description: "Your saved work is safe. Try loading the list again.",
    className: "w-full max-w-lg",
  },
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
    action: { control: false },
  },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unavailable: Story = {};

function RetryExample(args: ErrorStateProps) {
  const [recovered, setRecovered] = useState(false);
  if (recovered) {
    return (
      <Alert className="w-full max-w-lg">
        <AlertTitle>Projects loaded</AlertTitle>
        <AlertDescription>The local example recovered successfully.</AlertDescription>
      </Alert>
    );
  }
  return (
    <ErrorState
      {...args}
      action={
        <Button variant="outline" onClick={() => setRecovered(true)}>
          Retry loading
        </Button>
      }
    />
  );
}

export const RetryAction: Story = {
  render: (args) => <RetryExample {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Retry loading" }));
    await expect(canvas.findByText("Projects loaded")).resolves.toBeVisible();
  },
};
