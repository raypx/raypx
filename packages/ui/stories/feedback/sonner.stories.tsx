import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { useEffect, useId, useState } from "react";
import { Button } from "../../src/components/button.js";
import { Toaster, toast, type ToasterProps } from "../../src/components/sonner.js";

const meta = {
  title: "Feedback/Sonner",
  component: Toaster,
  tags: ["autodocs"],
  args: { position: "bottom-right", closeButton: true },
  argTypes: {
    position: {
      control: "select",
      options: [
        "top-left",
        "top-center",
        "top-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
      ],
    },
    theme: { control: false, description: "Follows the preview theme toolbar." },
    closeButton: { control: "boolean" },
    id: { control: false },
    toastOptions: { control: false },
  },
  parameters: {
    docs: {
      story: { inline: false },
      description: {
        component:
          "Docs uses isolated light previews. Open Canvas to change Controls, switch themes, and try interactions.",
      },
    },
  },
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

function NotificationsExample(args: ToasterProps) {
  const toasterId = useId();
  useEffect(
    () => () => {
      for (const kind of ["success", "info", "warning", "error"])
        toast.dismiss(`${toasterId}-${kind}`);
    },
    [toasterId],
  );
  return (
    <div className="flex flex-wrap gap-3">
      <Toaster {...args} id={toasterId} />
      <Button
        onClick={() =>
          toast.success("Changes saved", {
            id: `${toasterId}-success`,
            toasterId,
            description: "Your local example is up to date.",
          })
        }
      >
        Show success
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.info("New version available", { id: `${toasterId}-info`, toasterId })}
      >
        Show information
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.warning("Storage almost full", { id: `${toasterId}-warning`, toasterId })
        }
      >
        Show warning
      </Button>
      <Button
        variant="destructive"
        onClick={() =>
          toast.error("Changes were not saved", {
            id: `${toasterId}-error`,
            toasterId,
            description: "Try again when your connection returns.",
          })
        }
      >
        Show error
      </Button>
    </div>
  );
}

export const Notifications: Story = {
  render: (args, { globals }) => (
    <NotificationsExample {...args} theme={globals.theme === "dark" ? "dark" : "light"} />
  ),
};

function UndoExample(args: ToasterProps) {
  const toasterId = useId();
  const toastId = `${toasterId}-undo`;
  const [removed, setRemoved] = useState(false);
  useEffect(
    () => () => {
      toast.dismiss(toastId);
    },
    [toastId],
  );
  return (
    <div className="space-y-4">
      <Toaster {...args} id={toasterId} />
      <Button
        variant="outline"
        onClick={() => {
          setRemoved(true);
          toast("Note deleted", {
            id: toastId,
            toasterId,
            duration: Infinity,
            description: "You can restore this local example.",
            action: { label: "Undo deletion", onClick: () => setRemoved(false) },
          });
        }}
      >
        Delete note
      </Button>
      <output className="block text-sm text-muted-foreground">
        {removed ? "Note removed from the example." : "Note is available in the example."}
      </output>
    </div>
  );
}

export const UndoAction: Story = {
  render: (args, { globals }) => (
    <UndoExample {...args} theme={globals.theme === "dark" ? "dark" : "light"} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const documentBody = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Delete note" }));
    await userEvent.click(await documentBody.findByRole("button", { name: "Undo deletion" }));
    await expect(canvas.getByText("Note is available in the example.")).toBeVisible();
  },
};
