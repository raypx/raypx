import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { CommandPalette, type CommandGroup } from "./command-palette.tsx";

function Palette({ groups }: { groups: CommandGroup[] }) {
  const [open, setOpen] = useState(false);
  return (
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <CommandPalette open={open} onOpenChange={setOpen} groups={groups} />
    </BrowserLanguageProvider>
  );
}

it("opens from the keyboard, searches labels and details and runs the chosen command", async () => {
  const openSession = vi.fn();
  const openProject = vi.fn();
  render(
    <Palette
      groups={[
        {
          label: "Projects",
          items: [{ id: "project", label: "Raypx", detail: "Studio Mac", onSelect: openProject }],
        },
        {
          label: "Recent sessions",
          items: [
            { id: "session", label: "Fix the build", detail: "Raypx", onSelect: openSession },
          ],
        },
        { label: "Empty", items: [] },
      ]}
    />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const input = await screen.findByRole("combobox", { name: "Search" });
  expect(screen.getByText("Projects")).toBeTruthy();
  expect(screen.queryByText("Empty")).toBeNull();
  fireEvent.change(input, { target: { value: "studio" } });
  await waitFor(() => expect(screen.queryByRole("option", { name: /Fix the build/ })).toBeNull());
  fireEvent.change(input, { target: { value: "build" } });
  fireEvent.click(await screen.findByRole("option", { name: /Fix the build/ }));
  expect(openSession).toHaveBeenCalledTimes(1);
  expect(openProject).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("reports when nothing matches", async () => {
  render(
    <Palette groups={[{ label: "Pages", items: [{ id: "a", label: "Memory", onSelect() {} }] }]} />,
  );
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  fireEvent.change(await screen.findByRole("combobox", { name: "Search" }), {
    target: { value: "zzz" },
  });
  expect(await screen.findByText("No results")).toBeTruthy();
});
