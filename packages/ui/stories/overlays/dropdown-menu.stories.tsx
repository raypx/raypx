import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { useState, type ComponentProps } from "react";
import { Button } from "../../src/components/button.js";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../src/components/dropdown-menu.js";

type MenuArgs = ComponentProps<typeof DropdownMenu> & {
  withPreferences: boolean;
  disabled: boolean;
  onAction: (action: string) => void;
};
function ProjectMenu({ withPreferences, disabled, onAction, ...args }: MenuArgs) {
  const [archived, setArchived] = useState(false);
  const [density, setDensity] = useState("comfortable");
  const [open, setOpen] = useState(args.defaultOpen ?? false);
  return (
    <DropdownMenu {...args} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          tabIndex={open && args.modal !== false ? -1 : 0}
        >
          Project actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>
          {withPreferences ? "View preferences" : "Project actions"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {withPreferences ? (
          <>
            <DropdownMenuCheckboxItem
              checked={archived}
              onCheckedChange={setArchived}
              onSelect={(event) => event.preventDefault()}
            >
              Include archived projects
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={density}
              onValueChange={setDensity}
              aria-label="Row density"
            >
              <DropdownMenuRadioItem value="comfortable">Comfortable rows</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="compact">Compact rows</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => onAction("rename")}>
              Rename project<DropdownMenuShortcut aria-hidden="true">F2</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("duplicate")}>
              Duplicate project
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Transfer ownership</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Export project</DropdownMenuSubTrigger>
              <DropdownMenuSubContent aria-label="Export formats">
                <DropdownMenuItem onSelect={() => onAction("csv")}>Download CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAction("json")}>Download JSON</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onAction("delete")}
            >
              Delete project
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
const meta = {
  title: "Overlays/DropdownMenu",
  component: DropdownMenu,
  args: {
    withPreferences: false,
    disabled: false,
    modal: true,
    onAction: fn<(action: string) => void>(),
  },
  argTypes: {
    withPreferences: { control: "boolean" },
    disabled: { control: "boolean" },
    modal: { control: "boolean" },
    onAction: { control: false },
    open: { control: false },
    children: { control: false },
  },
  parameters: {
    docs: {
      story: { inline: false },
      description: {
        component:
          "Docs uses isolated light previews. Open Canvas for Controls and theme changes. Menu items expose caller-owned callbacks and never execute business actions themselves.",
      },
    },
  },
  render: (args) => (
    <div className="min-h-72">
      <ProjectMenu {...args} />
    </div>
  ),
} satisfies Meta<MenuArgs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Actions: Story = {};
export const OpenInitially: Story = { args: { defaultOpen: true } };
export const Preferences: Story = { args: { withPreferences: true, defaultOpen: true } };
export const DisabledTrigger: Story = { args: { disabled: true } };
export const KeyboardSubmenu: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Project actions" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    const rename = await page.findByRole("menuitem", { name: "Rename project" });
    await waitFor(() => expect(rename).toHaveFocus());
    await expect(trigger).toHaveAttribute("tabindex", "-1");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    const exporter = page.getByRole("menuitem", { name: "Export project" });
    await waitFor(() => expect(exporter).toHaveFocus());
    await expect(page.getByRole("menuitem", { name: "Transfer ownership" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.keyboard("{ArrowRight}");
    const csv = await page.findByRole("menuitem", { name: "Download CSV" });
    await waitFor(() => expect(csv).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    await expect(args.onAction).toHaveBeenCalledWith("csv");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger).toHaveAttribute("tabindex", "0");
  },
};
