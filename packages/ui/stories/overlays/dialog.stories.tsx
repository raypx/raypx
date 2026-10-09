import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useId, useState, type ComponentProps } from "react";
import { Button } from "../../src/components/button.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../src/components/dialog.js";
import { Input } from "../../src/components/input.js";
import { Label } from "../../src/components/label.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/components/select.js";

type DialogArgs = ComponentProps<typeof Dialog> & {
  heading: string;
  description: string;
  withSelect: boolean;
};

function WorkspaceDialog({ heading, description, withSelect, ...args }: DialogArgs) {
  const id = useId();
  const [access, setAccess] = useState("private");
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-4">
      <Dialog {...args}>
        <DialogTrigger asChild>
          <Button>Edit workspace</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{heading}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`${id}-name`}>Workspace name</Label>
            <Input id={`${id}-name`} defaultValue="Personal workspace" />
          </div>
          {withSelect && (
            <div className="space-y-2">
              <Label htmlFor={`${id}-access`}>Default access</Label>
              <Select value={access} onValueChange={setAccess}>
                <SelectTrigger id={`${id}-access`} aria-label="Default access">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel changes</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button onClick={() => setSaved(true)}>Save changes</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <output className="block text-sm text-muted-foreground">
        {saved ? "Workspace changes saved locally." : "Workspace has no unsaved changes."}
      </output>
    </div>
  );
}

const meta = {
  title: "Overlays/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  args: {
    heading: "Edit workspace",
    description: "Update the workspace name and default access.",
    withSelect: false,
    modal: true,
  },
  argTypes: {
    heading: { control: "text" },
    description: { control: "text" },
    withSelect: { control: "boolean" },
    modal: { control: "boolean" },
    open: { control: false },
    defaultOpen: { control: false },
    children: { control: false },
  },
  render: (args) => <WorkspaceDialog {...args} />,
  parameters: {
    docs: {
      story: { inline: false },
      description: {
        component:
          "Docs uses isolated light previews. Open Canvas to change Controls, switch themes, and try interactions.",
      },
    },
  },
} satisfies Meta<DialogArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EditWorkspace: Story = {};
export const OpenInitially: Story = { args: { defaultOpen: true } };
export const SelectInsideDialog: Story = {
  args: { withSelect: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Edit workspace" });
    await userEvent.click(trigger);
    const dialog = await page.findByRole("dialog", { name: "Edit workspace" });
    const name = within(dialog).getByRole("textbox", { name: "Workspace name" });
    await waitFor(() => expect(name).toHaveFocus());
    const select = within(dialog).getByRole("combobox", { name: "Default access" });
    await userEvent.click(select);
    const options = await page.findByRole("listbox");
    await userEvent.click(within(options).getByRole("option", { name: "Team" }));
    await waitFor(() => expect(select).toHaveTextContent("Team"));
    await waitFor(() => expect(select).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
