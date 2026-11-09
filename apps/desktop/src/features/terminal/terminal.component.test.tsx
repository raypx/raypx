/** @vitest-environment happy-dom */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { FitAddon } from "@xterm/addon-fit";
import { deferred, mocks, page } from "../../../tests/helpers/router-local.tsx";

beforeEach(() => {
  mocks.terminal.mockImplementation(function () {
    return {
      options: {},
      cols: 80,
      rows: 24,
      loadAddon() {},
      open() {},
      attachCustomKeyEventHandler() {},
      onData: () => ({ dispose() {} }),
      onResize: () => ({ dispose() {} }),
      reset() {},
      write() {},
      focus() {},
      dispose() {},
    };
  });
  vi.spyOn(FitAddon.prototype, "fit").mockImplementation(() => {});
  const request = mocks.localRequest.getMockImplementation()!;
  mocks.localRequest.mockImplementation(async (method, params) => {
    if (method === "terminal.open") return { id: "terminal-1" };
    if (method === "terminal.close") return { cancelled: true };
    return request(method, params);
  });
});
it("opens the current project with a host-selected default shell only after a click and keeps stop", async () => {
  await page("/terminal?project=work");
  const open = await screen.findByRole("button", { name: "Open terminal in this project" });
  expect(screen.queryByLabelText("Executable path")).toBeNull();
  expect(mocks.localRequest.mock.calls.some(([method]) => method === "terminal.open")).toBe(false);
  await userEvent.click(open);
  expect(mocks.localRequest).toHaveBeenCalledWith("terminal.open", {
    cwd: "/work",
    args: [],
    timeoutMs: 86_400_000,
    cols: 80,
    rows: 24,
  });
  await userEvent.click(await screen.findByRole("button", { name: "Close terminal" }));
  expect(mocks.localRequest).toHaveBeenCalledWith("terminal.close", { id: "terminal-1" });
});
it("requires a cwd without a project and allows explicit advanced commands", async () => {
  const request = mocks.localRequest.getMockImplementation()!;
  mocks.localRequest.mockImplementation(async (method, params) =>
    method === "roots.list" ? [] : request(method, params),
  );
  await page("/terminal");
  const cwd = await screen.findByLabelText("Working directory");
  expect(cwd.hasAttribute("required")).toBe(true);
  fireEvent.change(cwd, { target: { value: "/custom/work" } });
  expect(mocks.localRequest.mock.calls.some(([method]) => method === "terminal.open")).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Advanced options" }));
  expect(screen.getByLabelText("Working directory")).toHaveProperty("value", "/custom/work");
  fireEvent.change(screen.getByLabelText("Executable path"), {
    target: { value: "/custom/shell" },
  });
  fireEvent.change(screen.getByLabelText("Working directory"), {
    target: { value: "/custom/work" },
  });
  fireEvent.change(screen.getByLabelText("Arguments (JSON array)"), {
    target: { value: '["--interactive"]' },
  });
  await userEvent.click(screen.getByRole("button", { name: "Open terminal" }));
  expect(mocks.localRequest).toHaveBeenCalledWith("terminal.open", {
    executable: "/custom/shell",
    cwd: "/custom/work",
    args: ["--interactive"],
    timeoutMs: 86_400_000,
    cols: 80,
    rows: 24,
  });
});
it("never substitutes or starts an unavailable project", async () => {
  await page("/terminal?project=revoked");
  const open = await screen.findByRole("button", { name: "Open terminal" });
  expect(open.hasAttribute("disabled")).toBe(true);
  await userEvent.click(open);
  expect(mocks.localRequest.mock.calls.some(([method]) => method === "terminal.open")).toBe(false);
});
it("closes a terminal that finishes opening after the user leaves", async () => {
  const opening = deferred<{ id: string }>();
  const request = mocks.localRequest.getMockImplementation()!;
  mocks.localRequest.mockImplementation(async (method, params) =>
    method === "terminal.open" ? opening.promise : request(method, params),
  );
  const router = await page("/terminal?project=work");
  await userEvent.click(
    await screen.findByRole("button", { name: "Open terminal in this project" }),
  );
  await act(async () => router.navigate({ to: "/login" }));
  await act(async () => opening.resolve({ id: "late-terminal" }));
  await waitFor(() =>
    expect(mocks.localRequest).toHaveBeenCalledWith("terminal.close", { id: "late-terminal" }),
  );
});

it("rejects malformed advanced arguments without opening a process", async () => {
  await page("/terminal?project=work");
  await userEvent.click(await screen.findByRole("button", { name: "Advanced options" }));
  fireEvent.change(screen.getByLabelText("Arguments (JSON array)"), { target: { value: "[123]" } });
  await userEvent.click(screen.getByRole("button", { name: "Open terminal" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Enter a JSON array of strings.");
  expect(mocks.localRequest.mock.calls.some(([method]) => method === "terminal.open")).toBe(false);
});
