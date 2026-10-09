import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useState, type ComponentProps } from "react";
import { Button, buttonVariants } from "../../src/components/button.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../src/components/alert-dialog.js";

type AlertDialogArgs = ComponentProps<typeof AlertDialog> & {
  heading: string;
  description: string;
};

function DeleteWorkspaceExample({
  heading,
  description,
  defaultOpen = false,
  open: suppliedOpen,
  onOpenChange,
  ...args
}: AlertDialogArgs) {
  const [deleted, setDeleted] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = suppliedOpen ?? open;
  return (
    <div className="space-y-4">
      <AlertDialog
        {...args}
        open={isOpen}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }}
      >
        <AlertDialogTrigger asChild>
          {/* The modal hides its opener; remove it from tab order until the dialog closes. */}
          <Button variant="destructive" tabIndex={isOpen ? -1 : 0}>
            Delete workspace
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{heading}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep workspace</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => setDeleted(true)}
            >
              Confirm deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <output className="block text-sm text-muted-foreground">
        {deleted ? "Workspace deleted locally." : "Workspace is unchanged."}
      </output>
    </div>
  );
}

const meta = {
  title: "Overlays/AlertDialog",
  component: AlertDialog,
  tags: ["autodocs"],
  args: {
    heading: "Delete workspace?",
    description:
      "This example changes local state only. Confirm to demonstrate a destructive action.",
  },
  argTypes: {
    heading: { control: "text" },
    description: { control: "text" },
    open: { control: false },
    defaultOpen: { control: false },
    children: { control: false },
  },
  render: (args) => <DeleteWorkspaceExample {...args} />,
  parameters: {
    docs: {
      story: { inline: false },
      description: {
        component:
          "Docs uses isolated light previews. Open Canvas to change Controls, switch themes, and try interactions.",
      },
    },
  },
} satisfies Meta<AlertDialogArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Confirmation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Delete workspace" });
    await userEvent.click(trigger);
    const dialog = await page.findByRole("alertdialog", { name: "Delete workspace?" });
    const keep = within(dialog).getByRole("button", { name: "Keep workspace" });
    await waitFor(() => expect(keep).toHaveFocus());
    await userEvent.click(keep);
    await waitFor(() => expect(page.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(canvas.getByText("Workspace is unchanged.")).toBeVisible();
    await expect(trigger).toHaveAttribute("tabindex", "0");
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    const reopened = await page.findByRole("alertdialog", { name: "Delete workspace?" });
    await userEvent.click(within(reopened).getByRole("button", { name: "Confirm deletion" }));
    await waitFor(() => expect(page.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(canvas.getByText("Workspace deleted locally.")).toBeVisible();
  },
};
export const OpenInitially: Story = {
  args: { defaultOpen: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("alertdialog", { name: "Delete workspace?" });
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Keep workspace" })).toHaveFocus(),
    );
  },
};
