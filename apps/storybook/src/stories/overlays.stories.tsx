import { Button } from "@raypx/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@raypx/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@raypx/ui/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@raypx/ui/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@raypx/ui/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@raypx/ui/components/ui/tooltip";
import { Modal } from "@raypx/ui/modal";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

const meta = {
  title: "Primitives/Overlays",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const DialogExample: Story = {
  name: "Dialog",
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Sign out everywhere</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign out of all devices?</DialogTitle>
          <DialogDescription>
            Every session ends, including this one. Device preferences stay on each device.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive">Sign out</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

function ModalExample({ drawer, busy }: { drawer: boolean; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Modal
      title={drawer ? "Navigation" : "Rename device"}
      description={busy ? "Saving… dismissal is blocked until it finishes." : "Shown in settings."}
      closeLabel="Close"
      trigger={<Button variant="outline">{drawer ? "Open drawer" : "Open modal"}</Button>}
      open={open}
      onOpenChange={setOpen}
      drawer={drawer}
      busy={busy}
    >
      <p className="text-sm text-muted-foreground">Modal body content.</p>
    </Modal>
  );
}

export const ModalPattern: StoryObj<typeof ModalExample> = {
  name: "Modal",
  args: { drawer: false, busy: false },
  render: (args) => <ModalExample {...args} />,
};

export const SheetExample: Story = {
  name: "Sheet",
  render: () => (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>Open sheet</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Task details</SheetTitle>
          <SheetDescription>Inspect parameters and approvals for this task.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};

export const PopoverExample: Story = {
  name: "Popover",
  render: () => (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>Details</PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Device grant</PopoverTitle>
          <PopoverDescription>
            Grants renew while this account session is active.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  ),
};

export const TooltipExample: Story = {
  name: "Tooltip",
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>Hover or focus me</TooltipTrigger>
      <TooltipContent>Keyboard focus shows tooltips too</TooltipContent>
    </Tooltip>
  ),
};

function DropdownExample() {
  const [language, setLanguage] = useState("en");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>Account</DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Language</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={language} onValueChange={setLanguage}>
            <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="zh">简体中文</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuItem variant="destructive">Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const DropdownMenuExample: Story = {
  name: "Dropdown menu",
  render: () => <DropdownExample />,
};
