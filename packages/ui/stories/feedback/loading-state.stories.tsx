import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoadingState } from "../../src/components/loading-state.js";
import { Skeleton } from "../../src/components/skeleton.js";

const meta = {
  title: "Feedback/LoadingState",
  component: LoadingState,
  tags: ["autodocs"],
  args: { label: "Loading projects", className: "w-full max-w-md" },
  argTypes: { label: { control: "text" }, children: { control: false } },
} satisfies Meta<typeof LoadingState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ContentLoading: Story = {};
export const CustomPlaceholder: Story = {
  args: { label: "Loading account details" },
  render: (args) => (
    <LoadingState {...args}>
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    </LoadingState>
  ),
};
