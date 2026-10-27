/** @vitest-environment happy-dom */
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";
import type { ContextDocument } from "../../src/index.js";
import { useState } from "react";
import type { TaskContextSelection } from "@raypx/core/tasks";
import { ContextPicker, ContextSnapshot } from "../../src/client.js";
import {
  document,
  version,
  deferred,
  fixture,
  language,
  id,
  deviceId,
  projectId,
  setupMemoryClientTests,
} from "../helpers/client";
setupMemoryClientTests();

it("filters sources by project and preserves a chosen historical revision until an explicit update", async () => {
  const client = fixture();
  client.list.mockResolvedValue([
    document(),
    {
      ...document(1, "Wrong project"),
      id: crypto.randomUUID(),
      project: { deviceId, projectId: crypto.randomUUID() },
    },
    { ...document(1, "Archived reference"), id: crypto.randomUUID(), archived: true },
  ]);
  client.history.mockResolvedValue([version(1)]);
  const changed = vi.fn();
  function Picker() {
    const [value, setValue] = useState<TaskContextSelection>({ sources: [{ id, revision: 1 }] });
    return (
      <ContextPicker
        client={client}
        ownerKey="account"
        target={{ deviceId, projectId }}
        value={value}
        onChange={(selection) => {
          changed(selection);
          setValue(selection);
        }}
      />
    );
  }
  render(language(<Picker />));
  await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
  const checkbox = await screen.findByRole("checkbox", { name: /Project conventions.*Revision 1/ });
  expect(checkbox).toBeChecked();
  expect(screen.queryByText("Wrong project")).toBeNull();
  expect(screen.queryByText("Archived reference")).toBeNull();
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Preview: Project conventions" }));
  expect(await screen.findByText("Reference revision 1")).toBeVisible();
  expect(client.history.mock.calls[0]?.[0]).toEqual({ id, before: 2, limit: 1 });
  expect(client.get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use revision 2" }));
  expect(changed).toHaveBeenLastCalledWith({ sources: [{ id, revision: 2 }] });
});

it("ignores a preview failure arriving after another preview succeeded", async () => {
  const client = fixture(),
    pending = deferred<ContextDocument>();
  const second = {
    ...document(2, "Second reference"),
    id: crypto.randomUUID(),
    content: "Second preview content",
  };
  client.list.mockResolvedValue([document(), second]);
  client.get.mockImplementation((input) =>
    input.id === id ? pending.promise : Promise.resolve(second),
  );
  render(
    language(
      <ContextPicker
        client={client}
        ownerKey="account"
        target={{ deviceId, projectId }}
        value={{ sources: [] }}
        onChange={() => {}}
      />,
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Preview: Project conventions" }));
  fireEvent.click(screen.getByRole("button", { name: "Preview: Second reference" }));
  expect(await screen.findByText("Second preview content")).toBeVisible();
  await act(async () => pending.reject(new Error("CONTEXT_NOT_FOUND: private late failure")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Second preview content")).toBeVisible();
});

it("clears a previous preview error when a later preview succeeds", async () => {
  const client = fixture();
  client.get
    .mockRejectedValueOnce(new Error("CONTEXT_NOT_FOUND: private failure"))
    .mockResolvedValueOnce(document());
  render(
    language(
      <ContextPicker
        client={client}
        ownerKey="device"
        target={{ deviceId, projectId }}
        value={{ sources: [] }}
        onChange={() => {}}
      />,
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Preview: Project conventions" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("This reference is unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Preview: Project conventions" }));
  expect(await screen.findByText("Reference revision 2")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each(["close", "refresh", "collapse"] as const)(
  "invalidates a pending preview on %s",
  async (action) => {
    const client = fixture(),
      pending = deferred<ContextDocument>();
    const second = {
      ...document(2, "Second reference"),
      id: crypto.randomUUID(),
      content: "Second preview content",
    };
    client.list.mockResolvedValue([document(), second]);
    client.get.mockResolvedValueOnce(second).mockImplementationOnce(() => pending.promise);
    render(
      language(
        <ContextPicker
          client={client}
          ownerKey="account"
          target={{ deviceId, projectId }}
          value={{ sources: [] }}
          onChange={() => {}}
        />,
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview: Second reference" }));
    await screen.findByText("Second preview content");
    fireEvent.click(screen.getByRole("button", { name: "Preview: Project conventions" }));
    if (action === "collapse")
      await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
    else
      fireEvent.click(
        screen.getByRole("button", { name: action === "close" ? "Close" : "Refresh" }),
      );
    await act(async () => {
      if (action === "refresh") pending.resolve(document());
      else pending.reject(new Error("CONTEXT_NOT_FOUND: private late failure"));
    });
    if (action === "collapse")
      await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Second preview content")).toBeNull();
    expect(screen.queryByText("Reference revision 2")).toBeNull();
  },
);

it("never auto-selects references and enforces the eight-source limit", async () => {
  const client = fixture(),
    sources = Array.from({ length: 9 }, (_, index) => ({
      ...document(1, `Reference ${index}`),
      id: crypto.randomUUID(),
    }));
  client.list.mockResolvedValue(sources);
  function Picker() {
    const [value, setValue] = useState<TaskContextSelection>({ sources: [] });
    return (
      <ContextPicker
        client={client}
        ownerKey="device"
        target={{ deviceId, projectId }}
        value={value}
        onChange={setValue}
      />
    );
  }
  render(language(<Picker />));
  await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
  const boxes = await screen.findAllByRole("checkbox");
  for (const box of boxes) expect(box).not.toBeChecked();
  for (const box of boxes.slice(0, 8)) await userEvent.click(box);
  expect(boxes[8]).toHaveAttribute("aria-disabled", "true");
  await userEvent.click(boxes[8]!);
  expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(8);
  expect(client.resolve).not.toHaveBeenCalled();
});

it("renders the captured content as text without loading the current library", async () => {
  render(
    language(
      <ContextSnapshot
        snapshot={{
          capturedAt: "2026-10-26T00:00:00Z",
          sources: [
            { ...document(1), scope: "account", content: "<script>old frozen text</script>" },
          ],
        }}
      />,
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: /Project conventions.*Revision 1/ }));
  expect(await screen.findByText("<script>old frozen text</script>")).toBeVisible();
  expect(window.document.querySelector("script")).toBeNull();
});
