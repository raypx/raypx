import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "../../src/components/skeleton.js";

const meta = {
  title: "Feedback/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
  args: { className: "h-5 w-64", "aria-hidden": true },
  argTypes: { className: { control: "text" }, children: { control: false } },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextLine: Story = {};
export const Avatar: Story = { args: { className: "size-12 rounded-full" } };
export const ContentShape: Story = {
  render: () => (
    <div className="flex w-full max-w-md items-start gap-4" aria-hidden="true">
      <Skeleton className="size-12 shrink-0 rounded-full" />
      <div className="flex-1 space-y-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  ),
};
