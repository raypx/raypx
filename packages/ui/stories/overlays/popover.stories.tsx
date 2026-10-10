import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useId, type ComponentProps } from "react";
import { Button } from "../../src/components/button.js";
import { Input } from "../../src/components/input.js";
import { Label } from "../../src/components/label.js";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "../../src/components/popover.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../../src/components/dialog.js";

type PopoverArgs = ComponentProps<typeof Popover> & {
  align: "start" | "center" | "end";
  side: "top" | "right" | "bottom" | "left";
};
function FilterPopover({ align, side, ...args }: PopoverArgs) {
  const id = useId();
  return (
    <Popover {...args}>
      <PopoverTrigger asChild>
        <Button variant="outline">Filter projects</Button>
      </PopoverTrigger>
      <PopoverContent align={align} side={side} aria-label="Project filters">
        <div className="grid gap-4">
          <div>
            <h2 className="text-base font-semibold">Project filters</h2>
            <p className="text-sm text-muted-foreground">Limit this list to matching projects.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={id}>Project name</Label>
            <Input id={id} placeholder="Search by name" />
          </div>
          <PopoverClose asChild>
            <Button>Apply filters</Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
const meta = {
  title: "Overlays/Popover",
  component: Popover,
  args: { align: "start", side: "bottom", modal: false },
  argTypes: {
    align: { control: "radio", options: ["start", "center", "end"] },
    side: { control: "radio", options: ["top", "right", "bottom", "left"] },
    modal: { control: "boolean" },
    open: { control: false },
    children: { control: false },
  },
  parameters: {
    docs: {
      story: { inline: false },
      description: {
        component:
          "Docs uses isolated light previews. Open Canvas for Controls and theme changes. Provide an accessible name for interactive popover content.",
      },
    },
  },
  render: (args) => (
    <div className="min-h-64 p-4">
      <FilterPopover {...args} />
    </div>
  ),
} satisfies Meta<PopoverArgs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Filters: Story = {};
export const OpenInitially: Story = { args: { defaultOpen: true } };
export const EscapesClipping: Story = {
  render: (args) => (
    <div className="h-20 w-full max-w-sm overflow-hidden rounded-md border p-3">
      <FilterPopover {...args} />
      <p className="mt-2 text-sm text-muted-foreground">
        The panel escapes this clipped container.
      </p>
    </div>
  ),
};
export const InsideDialog: Story = {
  render: (args) => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Edit project view</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Edit project view</DialogTitle>
        <DialogDescription>Choose which projects to include in this view.</DialogDescription>
        <FilterPopover {...args} />
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Edit project view" });
    await userEvent.click(trigger);
    const dialog = await page.findByRole("dialog", { name: "Edit project view" });
    const filter = within(dialog).getByRole("button", { name: "Filter projects" });
    await userEvent.click(filter);
    const panel = await page.findByRole("dialog", { name: "Project filters" });
    const view = canvasElement.ownerDocument.defaultView;
    if (!view) throw new Error("The story needs a browser document.");
    await expect(Number(view.getComputedStyle(panel).zIndex)).toBeGreaterThan(
      Number(view.getComputedStyle(dialog).zIndex),
    );
    await waitFor(() =>
      expect(within(panel).getByRole("textbox", { name: "Project name" })).toHaveFocus(),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(page.queryByRole("dialog", { name: "Project filters" })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(filter).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(page.queryByRole("dialog", { name: "Edit project view" })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const KeyboardDismissal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Filter projects" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const panel = await page.findByRole("dialog", { name: "Project filters" });
    await waitFor(() =>
      expect(within(panel).getByRole("textbox", { name: "Project name" })).toHaveFocus(),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(page.queryByRole("dialog", { name: "Project filters" })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
