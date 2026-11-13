import { expect, it, vi } from "vitest";
import type { ComputerDirectory, ComputerFile } from "@raypx/core/computers";
import {
  computerFileDestination,
  computerFileRows,
  computerPreviewText,
  ComputerFilesController,
  type ComputerFilesPort,
} from "./computer-files.js";
import { computerSpaceId, deferred } from "../../tests/support/computer-fixture.js";

function fixture() {
  const listDirectory = vi.fn<ComputerFilesPort["listDirectory"]>(async ({ path }) => ({
    status: "available",
    entries:
      path === "."
        ? [
            { path: "folder", kind: "directory" },
            { path: "root.txt", kind: "file" },
          ]
        : [{ path: "folder/notes.txt", kind: "file" }],
    truncated: false,
  }));
  const readFile = vi.fn<ComputerFilesPort["readFile"]>(async () => ({
    status: "available",
    bytes: "aGVsbG8=",
    size: 5,
    truncated: false,
    contentType: "text",
  }));
  const controller = new ComputerFilesController(computerSpaceId, { listDirectory, readFile });
  return { controller, listDirectory, readFile };
}

it("loads only requested directories and navigates the visible tree", async () => {
  const test = fixture();
  expect(test.listDirectory).not.toHaveBeenCalled();
  await test.controller.refresh();
  expect(test.listDirectory).toHaveBeenCalledExactlyOnceWith({
    spaceId: computerSpaceId,
    path: ".",
    limit: 100,
  });
  expect(computerFileRows(test.controller.getSnapshot()).map((row) => row.path)).toEqual([
    ".",
    "folder",
    "root.txt",
  ]);
  await test.controller.expand("folder");
  const view = test.controller.getSnapshot();
  expect(computerFileRows(view).map((row) => row.path)).toEqual([
    ".",
    "folder",
    "folder/notes.txt",
    "root.txt",
  ]);
  expect(computerFileDestination(view, "folder", "ArrowRight")).toBe("folder/notes.txt");
  expect(computerFileDestination(view, "folder/notes.txt", "ArrowLeft")).toBe("folder");
  expect(computerFileDestination(view, "folder", "ArrowDown")).toBe("folder/notes.txt");
  expect(computerFileDestination(view, "root.txt", "ArrowUp")).toBe("folder/notes.txt");
  expect(computerFileDestination(view, "folder", "Home")).toBe(".");
  expect(computerFileDestination(view, "folder", "End")).toBe("root.txt");
  test.controller.collapse("folder");
  expect(computerFileRows(test.controller.getSnapshot()).map((row) => row.path)).toEqual([
    ".",
    "folder",
    "root.txt",
  ]);
  await test.controller.expand("folder");
  expect(test.listDirectory).toHaveBeenCalledTimes(2);
});

it("keeps bounded text, binary, sizes and truncation as server observations", async () => {
  const test = fixture();
  test.listDirectory.mockResolvedValueOnce({ status: "available", entries: [], truncated: true });
  await test.controller.refresh();
  expect(test.controller.getSnapshot().directories["."]).toMatchObject({ truncated: true });
  test.readFile.mockResolvedValueOnce({
    status: "available",
    bytes: "aGVsbG8=",
    size: 90_000,
    truncated: true,
    contentType: "text",
  });
  await test.controller.select("notes.txt");
  expect(test.readFile).toHaveBeenCalledWith({
    spaceId: computerSpaceId,
    path: "notes.txt",
    maxBytes: 65_536,
  });
  expect(test.controller.getSnapshot().sizes["notes.txt"]).toBe(90_000);
  expect(computerPreviewText("aGVsbG8=")).toBe("hello");
  test.readFile.mockResolvedValueOnce({
    status: "available",
    bytes: "AA==",
    size: 1,
    truncated: false,
    contentType: "binary",
  });
  await test.controller.select("binary");
  expect(test.controller.getSnapshot().preview).toMatchObject({ contentType: "binary" });
});

it("refreshes expanded directories and the selected file without changing tree selection", async () => {
  const test = fixture();
  await test.controller.refresh();
  await test.controller.expand("folder");
  await test.controller.select("root.txt");
  await test.controller.refresh();
  expect(test.listDirectory).toHaveBeenCalledTimes(4);
  expect(test.readFile).toHaveBeenCalledTimes(2);
  expect(test.controller.getSnapshot()).toMatchObject({
    expanded: [".", "folder"],
    selectedPath: "root.txt",
    refreshing: false,
  });
});

it.each(["not-configured", "stopped", "starting", "stopping", "failed", "destroyed"] as const)(
  "shows %s without any read or lifecycle mutation",
  (status) => {
    const test = fixture();
    test.controller.setUnavailable(status);
    expect(test.controller.getSnapshot().directories["."]?.status).toBe(
      status === "not-configured" ? "not-configured" : "not-running",
    );
    expect(test.listDirectory).not.toHaveBeenCalled();
    expect(test.readFile).not.toHaveBeenCalled();
  },
);

it("drops stale responses after stop, selection changes and disposal", async () => {
  const test = fixture();
  const directory = deferred<ComputerDirectory>();
  test.listDirectory.mockReturnValueOnce(directory.promise);
  const refresh = test.controller.refresh();
  test.controller.setUnavailable("stopped");
  directory.resolve({ status: "available", entries: [], truncated: false });
  await refresh;
  expect(test.controller.getSnapshot().directories["."]?.status).toBe("not-running");
  const file = deferred<ComputerFile>();
  test.readFile.mockReturnValueOnce(file.promise);
  const selected = test.controller.select("older.txt");
  await test.controller.select("newer.txt");
  file.resolve({
    status: "available",
    bytes: "",
    size: 0,
    truncated: false,
    contentType: "binary",
  });
  await selected;
  expect(test.controller.getSnapshot()).toMatchObject({
    selectedPath: "newer.txt",
    preview: { size: 5 },
  });
  test.controller.dispose();
  expect(test.controller.getSnapshot().preview).toBeNull();
});

it("uses safe error states and keeps provider unavailability explicit", async () => {
  const test = fixture();
  test.listDirectory.mockRejectedValueOnce(new Error("private diagnostics"));
  await test.controller.refresh();
  expect(test.controller.getSnapshot().directories["."]).toEqual({ status: "error" });
  test.listDirectory.mockResolvedValueOnce({ status: "unavailable", code: "FILES_UNAVAILABLE" });
  await test.controller.refresh();
  expect(test.controller.getSnapshot().directories["."]).toEqual({
    status: "unavailable",
    code: "FILES_UNAVAILABLE",
  });
});

it("rejects an older preview after A to B to A selection", async () => {
  const test = fixture();
  const older = deferred<ComputerFile>();
  test.readFile.mockReturnValueOnce(older.promise);
  const first = test.controller.select("a.txt");
  await test.controller.select("b.txt");
  await test.controller.select("a.txt");
  older.resolve({ status: "available", bytes: "", size: 0, truncated: false, contentType: "text" });
  await first;
  expect(test.controller.getSnapshot()).toMatchObject({
    selectedPath: "a.txt",
    preview: { size: 5 },
  });
});

it("follows an in-flight refresh with one queued read for a newly finished tool", async () => {
  const test = fixture();
  const older = deferred<ComputerDirectory>();
  test.listDirectory.mockReturnValueOnce(older.promise);
  const first = test.controller.refresh();
  await test.controller.refresh();
  await test.controller.refresh();
  older.resolve({ status: "available", entries: [], truncated: false });
  await first;
  expect(test.listDirectory).toHaveBeenCalledTimes(2);
  expect(test.controller.getSnapshot().directories["."]).toMatchObject({
    entries: [
      { path: "folder", kind: "directory" },
      { path: "root.txt", kind: "file" },
    ],
  });
});
