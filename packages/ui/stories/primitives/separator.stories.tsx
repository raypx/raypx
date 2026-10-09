import type { Meta, StoryObj } from "@storybook/react-vite";
import { Separator } from "../../src/components/separator.js";

const meta = {
  title: "Primitives/Separator",
  component: Separator,
  tags: ["autodocs"],
  args: { orientation: "horizontal", decorative: true },
  argTypes: {
    orientation: { control: "select", options: ["horizontal", "vertical"] },
    decorative: { control: "boolean" },
  },
  render: (args) =>
    args.orientation === "vertical" ? (
      <div className="flex h-6 items-center gap-4">
        <span>Projects</span>
        <Separator {...args} />
        <span>Team</span>
      </div>
    ) : (
      <div className="grid w-80 max-w-full gap-3">
        <p>Project settings</p>
        <Separator {...args} />
        <p className="text-sm text-muted-foreground">Manage workspace preferences.</p>
      </div>
    ),
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {};
export const Vertical: Story = { args: { orientation: "vertical" } };
export const Semantic: Story = { args: { decorative: false } };
