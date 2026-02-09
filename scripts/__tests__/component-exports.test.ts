import fg from "fast-glob";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateComponentExports } from "../utils/component-exports";
import * as paths from "../utils/paths";

vi.mock("fs-extra", () => ({
  default: {
    readFile: vi.fn(),
    outputFile: vi.fn(),
  },
}));

vi.mock("fast-glob", () => ({
  default: vi.fn(),
}));

// Use a stable PROJECT_ROOT for deterministic paths
vi.spyOn(paths, "PROJECT_ROOT", "get").mockReturnValue("/tmp/project");
vi.spyOn(paths, "NODE_MODULES_PATH", "get").mockReturnValue("/tmp/project/node_modules");

const mockedFs = fs as unknown as {
  readFile: ReturnType<typeof vi.fn>;
  outputFile: ReturnType<typeof vi.fn>;
};

const mockedFg = fg as unknown as ReturnType<typeof vi.fn>;

describe("component-exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not write file when cache hash matches", async () => {
    mockedFg.mockResolvedValue(["A.tsx", "B.tsx"]);
    const sorted = ["A.tsx", "B.tsx"].sort().join("|");
    const crypto = await import("node:crypto");
    const expectedHash = crypto.createHash("sha256").update(sorted).digest("hex");
    mockedFs.readFile.mockResolvedValue(
      JSON.stringify({ components: { hash: expectedHash, timestamp: Date.now() } }),
    );

    await generateComponentExports("components");

    expect(mockedFs.outputFile).not.toHaveBeenCalled();
  });

  it("rejects non-alphanumeric package names with special chars", async () => {
    await expect(generateComponentExports("compo*nents" as any)).rejects.toThrow(
      /Invalid package name/,
    );
  });

  it("skips generation when no entries exist", async () => {
    mockedFg.mockResolvedValue([]);
    mockedFs.readFile.mockRejectedValue(new Error("no cache"));

    await generateComponentExports("components");

    expect(mockedFs.outputFile).not.toHaveBeenCalled();
  });

  it("uses cache to skip when hash matches", async () => {
    mockedFg.mockResolvedValue(["X.tsx", "Y.tsx"]);
    // Pretend previous run wrote these two files
    const sorted = ["X.tsx", "Y.tsx"].sort().join("|");
    // Precomputed sha256 for the sorted string
    // We'll compute dynamically here the same way as code under test would do
    const crypto = await import("node:crypto");
    const expectedHash = crypto.createHash("sha256").update(sorted).digest("hex");

    mockedFs.readFile.mockResolvedValue(
      JSON.stringify({ components: { hash: expectedHash, timestamp: Date.now() } }),
    );

    await generateComponentExports("components");

    expect(mockedFs.outputFile).not.toHaveBeenCalled();
  });

  it("throws on invalid package name", async () => {
    await expect(generateComponentExports("../../evil")).rejects.toThrow(/Invalid package name/);
  });
});
