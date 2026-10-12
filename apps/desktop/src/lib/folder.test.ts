import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { invoke } from "@tauri-apps/api/core";
import { authorizeProjectFolder } from "./folder";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("project folder bridge", () => {
  it("reports browser preview explicitly", async () => {
    await expect(authorizeProjectFolder("/tmp/project")).resolves.toMatchObject({
      availability: "preview",
    });
    expect(invoke).not.toHaveBeenCalled();
  });
  it("matches the native command input and preserves its result", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    const result = { availability: "unavailable", authorizedProject: "/tmp/project" };
    vi.mocked(invoke).mockResolvedValue(result);
    await expect(authorizeProjectFolder("/tmp/project")).resolves.toBe(result);
    expect(invoke).toHaveBeenCalledWith("authorize_project_folder", {
      input: { path: "/tmp/project" },
    });
  });
});
