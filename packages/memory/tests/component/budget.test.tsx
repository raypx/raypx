/** @vitest-environment jsdom */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";
import type { ContextDocument } from "../../src/index.js";
import { taskExecutionBudget } from "@raypx/core/tasks";
import { ContextBudget } from "../../src/client.js";
import {
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

it("measures the selected historical version and updates on typing without refetching bodies", async () => {
  const client = fixture(),
    changed = vi.fn(),
    old = { ...version(1), content: '# "Heading"\n- item \\ path' };
  client.history.mockResolvedValue([old]);
  const value = { sources: [{ id, revision: 1 }] },
    target = { deviceId, projectId };
  const props = { client, ownerKey: "owner", target, value, prompt: "Task", onChange: changed };
  const page = render(language(<ContextBudget {...props} />));
  const expected = taskExecutionBudget({ prompt: "Task", context: { sources: [old] } });
  await waitFor(() =>
    expect(screen.getByLabelText("Reference and task budget")).toHaveTextContent(
      `${expected.characters} / 32000`,
    ),
  );
  page.rerender(language(<ContextBudget {...props} prompt={"x".repeat(32_000)} />));
  await screen.findByRole("alert");
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: "ready", exceeded: true }),
  );
  expect(client.get).toHaveBeenCalledTimes(1);
  expect(client.history).toHaveBeenCalledTimes(1);
  expect(client.resolve).not.toHaveBeenCalled();
});

it("ignores an old owner's late budget failure and aborts its requests", async () => {
  const client = fixture(),
    old = deferred<ContextDocument>(),
    changed = vi.fn();
  client.get.mockReturnValueOnce(old.promise);
  const props = {
    client,
    target: { deviceId, projectId },
    value: { sources: [{ id, revision: 2 }] },
    prompt: "Task",
    onChange: changed,
  };
  const page = render(language(<ContextBudget {...props} ownerKey="old-owner" />));
  await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));
  const signal = client.get.mock.calls[0]?.[1]?.signal;
  page.rerender(language(<ContextBudget {...props} ownerKey="new-owner" />));
  await screen.findByLabelText("Reference and task budget");
  await act(async () => old.reject(new Error("Old private failure")));
  expect(signal?.aborted).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      key: expect.stringContaining("new-owner"),
      status: "ready",
      exceeded: false,
    }),
  );
});

it("keeps unknown budgets blocked until a deliberate retry succeeds", async () => {
  const client = fixture(),
    changed = vi.fn();
  client.get.mockRejectedValueOnce(new Error("private service details"));
  render(
    language(
      <ContextBudget
        client={client}
        ownerKey="owner"
        target={{ deviceId, projectId }}
        value={{ sources: [{ id, revision: 2 }] }}
        prompt="Task"
        onChange={changed}
      />,
    ),
  );
  await screen.findByRole("alert");
  expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ status: "error" }));
  expect(screen.queryByText("private service details")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Recalculate budget" }));
  await screen.findByLabelText("Reference and task budget");
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: "ready", exceeded: false }),
  );
});
