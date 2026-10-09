import { useId } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "../../src/components/input.js";
import { Label } from "../../src/components/label.js";

const meta = {
  title: "Forms/Label",
  component: Label,
  tags: ["autodocs"],
  args: { children: "Display name" },
  argTypes: { children: { control: "text" }, htmlFor: { control: "text" } },
  render: function Render(args) {
    const generatedId = useId();
    const id = args.htmlFor ?? generatedId;
    return (
      <div className="grid w-80 max-w-full gap-2">
        <Label {...args} htmlFor={id} />
        <Input id={id} placeholder="Enter your name" />
      </div>
    );
  },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithInput: Story = {};
export const Required: Story = { args: { children: "Display name (required)" } };
