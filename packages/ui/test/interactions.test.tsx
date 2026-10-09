import { Checkbox } from "@raypx/ui/components/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@raypx/ui/components/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@raypx/ui/components/alert-dialog";
import { Button } from "@raypx/ui/components/button";
import { Field, FieldError, FieldLabel } from "@raypx/ui/components/field";
import { Input } from "@raypx/ui/components/input";
import { Label } from "@raypx/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/select";
import { Switch } from "@raypx/ui/components/switch";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

beforeAll(() => {
  // jsdom omits layout/pointer APIs used by Radix's portalled Select.
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

afterEach(cleanup);

test("dialog traps keyboard focus, dismisses with Escape, and returns focus to its trigger", async () => {
  const user = userEvent.setup();
  render(
    <>
      <Button>Outside action</Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button>Edit workspace</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Edit workspace</DialogTitle>
          <DialogDescription>Change your workspace name.</DialogDescription>
          <Label htmlFor="workspace-name">Workspace name</Label>
          <Input id="workspace-name" />
          <DialogClose asChild>
            <Button>Save changes</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </>,
  );
  const trigger = screen.getByRole("button", { name: "Edit workspace" });
  trigger.focus();
  await user.keyboard("{Enter}");
  const dialog = await screen.findByRole("dialog", { name: "Edit workspace" });
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Workspace name" })),
  );
  await user.tab({ shift: true });
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

test("confirmation starts at the safe action and runs the destructive callback only on confirmation", async () => {
  const user = userEvent.setup();
  const remove = vi.fn<() => void>();
  render(
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button>Delete workspace</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
        <AlertDialogDescription>This removes the workspace.</AlertDialogDescription>
        <AlertDialogCancel>Keep workspace</AlertDialogCancel>
        <AlertDialogAction onClick={remove}>Confirm deletion</AlertDialogAction>
      </AlertDialogContent>
    </AlertDialog>,
  );
  await user.click(screen.getByRole("button", { name: "Delete workspace" }));
  await screen.findByRole("alertdialog", { name: "Delete workspace?" });
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep workspace" })),
  );
  fireEvent.pointerDown(document.body);
  expect(screen.getByRole("alertdialog")).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Keep workspace" }));
  expect(remove).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Delete workspace" }));
  await user.click(screen.getByRole("button", { name: "Confirm deletion" }));
  expect(remove).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
});

test("checkbox supports its associated label, keyboard toggling, and native disabled behavior", async () => {
  const user = userEvent.setup();
  const changed = vi.fn<(value: boolean | "indeterminate") => void>();
  render(
    <>
      <Checkbox id="updates" onCheckedChange={changed} />
      <Label htmlFor="updates">Product updates</Label>
      <Checkbox aria-label="Disabled option" disabled onCheckedChange={changed} />
    </>,
  );
  const checkbox = screen.getByRole("checkbox", { name: "Product updates" });
  await user.click(screen.getByText("Product updates"));
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  expect(changed).toHaveBeenLastCalledWith(true);
  checkbox.focus();
  await user.keyboard(" ");
  expect(checkbox.getAttribute("aria-checked")).toBe("false");
  expect(changed).toHaveBeenLastCalledWith(false);
  await user.click(screen.getByRole("checkbox", { name: "Disabled option" }));
  expect(changed).toHaveBeenCalledTimes(2);
});

test("switch responds to Space and exposes its state to assistive technology", async () => {
  const user = userEvent.setup();
  const changed = vi.fn<(value: boolean) => void>();
  render(
    <>
      <Switch id="notifications" onCheckedChange={changed} />
      <Label htmlFor="notifications">Notifications</Label>
    </>,
  );
  const control = screen.getByRole("switch", { name: "Notifications" });
  control.focus();
  await user.keyboard(" ");
  expect(control.getAttribute("aria-checked")).toBe("true");
  expect(changed).toHaveBeenCalledWith(true);
});

test("select opens and selects an option using only the keyboard", async () => {
  const user = userEvent.setup();
  const changed = vi.fn<(value: string) => void>();
  render(
    <Select onValueChange={changed}>
      <SelectTrigger aria-label="Visibility">
        <SelectValue placeholder="Choose visibility" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="private">Private</SelectItem>
        <SelectItem value="team">Team</SelectItem>
      </SelectContent>
    </Select>,
  );
  const trigger = screen.getByRole("combobox", { name: "Visibility" });
  trigger.focus();
  await user.keyboard("{Enter}");
  await screen.findByRole("listbox");
  await user.keyboard("{End}{Enter}");
  await waitFor(() => expect(changed).toHaveBeenCalledWith("team"));
  expect(trigger.textContent).toContain("Team");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

test("field errors remain associated with the invalid input and omit empty messages", () => {
  render(
    <Field data-invalid="true">
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input id="email" aria-invalid="true" aria-describedby="email-error" />
      <FieldError
        id="email-error"
        errors={[
          undefined,
          { message: "Enter a valid email." },
          { message: "Enter a valid email." },
        ]}
      />
    </Field>,
  );
  const input = screen.getByRole("textbox", { name: "Email" });
  const error = screen.getByRole("alert");
  expect(input.getAttribute("aria-describedby")).toBe(error.id);
  expect(error.textContent).toBe("Enter a valid email.");
  cleanup();
  render(<FieldError errors={[undefined, {}]} />);
  expect(screen.queryByRole("alert")).toBeNull();
});
