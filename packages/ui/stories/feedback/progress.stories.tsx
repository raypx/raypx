import type { Meta, StoryObj } from "@storybook/react-vite";
import { Progress } from "../../src/components/progress.js";

const meta = {
  title: "Feedback/Progress",
  component: Progress,
  tags: ["autodocs"],
  args: { value: 40, max: 100, "aria-label": "Import progress" },
  argTypes: {
    value: { control: { type: "number", min: 0, max: 100, step: 1 } },
    max: { control: { type: "number", min: 1 } },
    "aria-label": { control: "text" },
  },
  render: (args) => <Progress {...args} className="w-full max-w-md" />,
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {};
export const NotStarted: Story = { args: { value: 0 } };
export const Complete: Story = { args: { value: 100 } };
export const Indeterminate: Story = { args: { value: null } };
export const CustomMaximum: Story = { args: { value: 25, max: 50 } };
export const ClampedValue: Story = { args: { value: 140 } };
