import type { Meta, StoryObj } from "@storybook/react-vite";
import { Textarea } from "../../src/components/textarea.js";

const meta = {
  title: "Forms/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  args: {
    placeholder: "Write a short project description",
    rows: 4,
    disabled: false,
    readOnly: false,
    "aria-label": "Project description",
  },
  argTypes: {
    placeholder: { control: "text" },
    defaultValue: { control: "text" },
    rows: { control: { type: "number", min: 2, max: 10 } },
    disabled: { control: "boolean" },
    readOnly: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div className="w-96 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Populated: Story = {
  args: { defaultValue: "A shared place for project notes and decisions." },
};
export const Disabled: Story = {
  args: { disabled: true, defaultValue: "Editing is currently unavailable." },
};
export const ReadOnly: Story = {
  args: { readOnly: true, defaultValue: "This description can be read and copied." },
};
