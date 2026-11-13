import { useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { CloseIcon } from "@raypx/icons/close";
import { IconButton } from "./icon-button.js";
import { Button } from "./components/ui/button.js";
import { Sheet, SheetContent, SheetTitle } from "./components/ui/sheet.js";
import { Dialog, DialogContent, DialogTitle } from "./components/ui/dialog.js";
import { TooltipProvider } from "./components/ui/tooltip.js";

function Fixture({
  escapeKeyBubbles = false,
  nestedProvider = false,
}: {
  escapeKeyBubbles?: boolean;
  nestedProvider?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  const controls = (
    <>
      <IconButton label="Close sheet" onClick={() => setOpen(false)}>
        <CloseIcon />
      </IconButton>
      <Button onClick={() => setNested(true)}>Open editor</Button>
      <Dialog open={nested} onOpenChange={setNested}>
        <DialogContent closeLabel="Close editor">
          <DialogTitle>Editor</DialogTitle>
          <IconButton label="Editor action">
            <CloseIcon />
          </IconButton>
        </DialogContent>
      </Dialog>
    </>
  );
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open sheet</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <TooltipProvider escapeKeyBubbles={escapeKeyBubbles}>
          <SheetContent showCloseButton={false}>
            <SheetTitle>Capability</SheetTitle>
            {nestedProvider ? <TooltipProvider>{controls}</TooltipProvider> : controls}
          </SheetContent>
        </TooltipProvider>
      </Sheet>
    </>
  );
}

async function focusCloseWithTooltip() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open sheet" }));
  const sheet = await screen.findByRole("dialog", { name: "Capability" });
  const close = within(sheet).getByRole("button", { name: "Close sheet" });
  await act(async () => {
    close.focus();
  });
  await user.hover(close);
  expect(await screen.findByRole("tooltip", { name: "Close sheet" })).toBeVisible();
  expect(close).toHaveFocus();
  return { user, sheet };
}

it("keeps ordinary tooltip Escape dismissal local by default", async () => {
  render(<Fixture />);
  const { user, sheet } = await focusCloseWithTooltip();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  expect(sheet).toBeVisible();
});

it("lets a scoped tooltip and its sheet dismiss on the same Escape", async () => {
  render(<Fixture escapeKeyBubbles />);
  const { user } = await focusCloseWithTooltip();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Capability" })).toBeNull());
});

it("inherits Escape propagation through nested tooltip providers", async () => {
  render(<Fixture escapeKeyBubbles nestedProvider />);
  const { user } = await focusCloseWithTooltip();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Capability" })).toBeNull());
});

it("preserves the nested editor's own Escape boundary", async () => {
  render(<Fixture escapeKeyBubbles />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open sheet" }));
  await user.click(await screen.findByRole("button", { name: "Open editor" }));
  const editor = await screen.findByRole("dialog", { name: "Editor" });
  const action = within(editor).getByRole("button", { name: "Editor action" });
  await act(async () => {
    action.focus();
  });
  await user.hover(action);
  expect(await screen.findByRole("tooltip", { name: "Editor action" })).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editor" })).toBeNull());
  expect(screen.getByRole("dialog", { name: "Capability" })).toBeVisible();
});
