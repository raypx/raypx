import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { ComponentProps } from "react";
import { Info } from "lucide-react";
import { Button } from "../../src/components/button.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../src/components/tooltip.js";

type TooltipArgs = ComponentProps<typeof TooltipContent> & {
  label: string;
  delayDuration: number;
  disabled: boolean;
  defaultOpen: boolean;
};
const meta = {
  title: "Overlays/Tooltip",
  component: TooltipContent,
  args: {
    label: "Only workspace owners can change access permissions.",
    side: "top",
    delayDuration: 300,
    disabled: false,
    defaultOpen: false,
  },
  argTypes: {
    label: { control: "text" },
    side: { control: "radio", options: ["top", "right", "bottom", "left"] },
    delayDuration: { control: { type: "number", min: 0 } },
    disabled: { control: "boolean" },
    defaultOpen: { control: "boolean" },
    children: { control: false },
  },
  parameters: {
    docs: {
      story: { inline: false },
      description: {
        component:
          "Docs uses isolated light previews. Open Canvas for Controls, theme changes, and keyboard interaction. Tooltip content is supplemental; keep essential instructions visible.",
      },
    },
  },
  render: ({ label, delayDuration, disabled, defaultOpen, ...args }) => (
    <div className="flex min-h-40 items-center justify-center">
      <TooltipProvider delayDuration={delayDuration}>
        <Tooltip defaultOpen={defaultOpen}>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="About workspace permissions"
              disabled={disabled}
            >
              <Info aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent {...args}>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  ),
} satisfies Meta<TooltipArgs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const HoverOrFocus: Story = {};
export const OpenInitially: Story = { args: { defaultOpen: true } };
export const DisabledTrigger: Story = { args: { disabled: true } };
export const LongText: Story = {
  args: {
    label:
      "Workspace owners can update access permissions, invite members from their team, and transfer a project to another workspace they manage.",
    defaultOpen: true,
    side: "right",
  },
};
export const KeyboardFocus: Story = {
  args: { delayDuration: 0 },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "About workspace permissions" });
    trigger.focus();
    await expect(await page.findByRole("tooltip")).toHaveTextContent(args.label);
    await expect(trigger).toHaveAccessibleDescription(args.label);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("tooltip")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
};
