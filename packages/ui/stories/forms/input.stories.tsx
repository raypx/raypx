import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "../../src/components/input.js";

const meta = {
  title: "Forms/Input",
  component: Input,
  tags: ["autodocs"],
  args: {
    type: "text",
    placeholder: "Enter your name",
    disabled: false,
    readOnly: false,
    "aria-label": "Display name",
  },
  argTypes: {
    type: { control: "select", options: ["text", "email", "password", "search", "number"] },
    placeholder: { control: "text" },
    defaultValue: { control: "text" },
    disabled: { control: "boolean" },
    readOnly: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div className="w-80 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Email: Story = {
  args: { type: "email", placeholder: "you@example.com", "aria-label": "Email address" },
};
export const Password: Story = {
  args: { type: "password", defaultValue: "example-password", "aria-label": "Password" },
};
export const Disabled: Story = { args: { disabled: true, defaultValue: "Unavailable" } };
export const ReadOnly: Story = { args: { readOnly: true, defaultValue: "Readonly name" } };
