import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowsClockwise, DownloadSimple, X } from "@phosphor-icons/react";
import { IconButton } from "@voidmix/ui/icon-button";
import { HelpHint } from "@voidmix/ui/help-hint";

const meta = {
  title: "Components/Utility controls",
  component: IconButton,
  args: { label: "Refresh", children: <ArrowsClockwise aria-hidden="true" /> },
} satisfies Meta<typeof IconButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Toolbar: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <IconButton label="Refresh">
        <ArrowsClockwise aria-hidden="true" />
      </IconButton>
      <IconButton label="Export current page">
        <DownloadSimple aria-hidden="true" />
      </IconButton>
      <IconButton label="Clear selection">
        <X aria-hidden="true" />
      </IconButton>
      <HelpHint
        label="Unavailable preferences"
        description="These preferences are saved locally. Their runtime is not connected yet."
      />
    </div>
  ),
};
export const LongHint: Story = {
  args: {
    hint: "Refresh this project's tasks while keeping your current filters and page selection.",
  },
};
export const Disabled: Story = { args: { disabled: true, label: "Refreshing…" } };
export const Dark: Story = { ...Toolbar, globals: { theme: "dark" } };
