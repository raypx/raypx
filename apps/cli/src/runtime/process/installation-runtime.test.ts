import { expect, it, vi } from "vite-plus/test";
import { cliInstallation } from "./installation.js";

it("recognizes a source runtime when VP names its executable bun.native", () => {
  vi.stubGlobal("process", { ...process, execPath: "/tools/bun.native" });
  try {
    expect(cliInstallation()).toMatchObject({ bundled: false, launcher: null });
  } finally {
    vi.unstubAllGlobals();
  }
});
