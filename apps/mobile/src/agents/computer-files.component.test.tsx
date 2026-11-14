import { expect, it, vi } from "vitest";
import { ComputerFilesController, type ComputerFilesPort } from "@raypx/agents/model";
import { spaceIdSchema } from "@raypx/core/spaces";
import { findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { ComputerFiles } from "./computer-files.js";

const spaceId = spaceIdSchema.parse("files-space");
function harness() {
  const port: ComputerFilesPort = {
    listDirectory: vi.fn<ComputerFilesPort["listDirectory"]>(async ({ path }) => ({
      status: "available",
      entries:
        path === "."
          ? [
              { path: "notes", kind: "directory" },
              { path: "linked", kind: "symlink" },
            ]
          : [{ path: "notes/readme.md", kind: "file" }],
      truncated: false,
    })),
    readFile: vi.fn<ComputerFilesPort["readFile"]>(async () => ({
      status: "available",
      bytes: btoa("# A bounded file"),
      contentType: "text",
      size: 16,
      truncated: true,
    })),
  };
  const controller = new ComputerFilesController(spaceId, port);
  return { controller, port };
}

it("loads bounded files lazily and previews text through the read-only controller", async () => {
  const h = harness();
  const view = await renderNative(<ComputerFiles controller={h.controller} status="running" />);
  expect(textContent(view.root)).toContain("Team sandbox · Workspace");
  expect(h.port.listDirectory).toHaveBeenCalledExactlyOnceWith({ spaceId, path: ".", limit: 100 });
  expect(h.port.readFile).not.toHaveBeenCalled();
  expect(findByLabel(view.root, "linked").props.isDisabled).toBe(true);
  await press(findByLabel(view.root, "notes"));
  expect(h.port.listDirectory).toHaveBeenLastCalledWith({ spaceId, path: "notes", limit: 100 });
  await press(findByLabel(view.root, "notes/readme.md"));
  expect(h.port.readFile).toHaveBeenCalledExactlyOnceWith({
    spaceId,
    path: "notes/readme.md",
    maxBytes: 65_536,
  });
  expect(textContent(view.root)).toContain("# A bounded file");
  expect(textContent(view.root)).toContain("This preview shows only the beginning of the file.");
  await view.unmount();
  expect(h.controller.getSnapshot().preview).toBeNull();
  h.controller.dispose();
});

it("does not read files while the computer is stopped and preserves its lifecycle state", async () => {
  const h = harness();
  const view = await renderNative(<ComputerFiles controller={h.controller} status="starting" />);
  expect(h.port.listDirectory).not.toHaveBeenCalled();
  expect(textContent(view.root)).toContain("Starting");
  expect(findByLabel(view.root, "Refresh files").props.isDisabled).toBe(true);
  await view.unmount();
  h.controller.dispose();
});

it("shows file failures and allows an explicit refresh", async () => {
  const h = harness();
  vi.mocked(h.port.listDirectory).mockRejectedValueOnce(new Error("unavailable"));
  const view = await renderNative(<ComputerFiles controller={h.controller} status="running" />);
  expect(textContent(view.root)).toContain("Could not load files");
  await press(findByLabel(view.root, "Refresh files"));
  expect(h.port.listDirectory).toHaveBeenCalledTimes(2);
  expect(findByLabel(view.root, "notes")).toBeDefined();
  await view.unmount();
  h.controller.dispose();
});
