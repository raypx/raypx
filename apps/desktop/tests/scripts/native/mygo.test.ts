import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import config from "../../../mygo.config";
import { assertNativeTarget, prepare } from "../../../scripts/native/mygo";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(version = config.version) {
  const desktop = await mkdtemp(join(tmpdir(), "raypx-mygo-prepare-"));
  roots.push(desktop);
  const cli = join(desktop, "standalone-cli");
  await writeFile(cli, "standalone CLI fixture");
  vi.spyOn(Bun, "spawn").mockReturnValue({
    stdout: new Response(`${version}\n`).body,
    exited: Promise.resolve(0),
  } as ReturnType<typeof Bun.spawn>);
  return { desktop, cli };
}

describe("MyGo prepared app inputs", () => {
  it("replaces embedded renderer files and preserves maintained packaging inputs", async () => {
    const paths = await fixture();
    await mkdir(join(paths.desktop, "dist/client/assets"), { recursive: true });
    await mkdir(join(paths.desktop, "generated/frontend/assets"), { recursive: true });
    await mkdir(join(paths.desktop, "resources"));
    await writeFile(join(paths.desktop, "dist/client/index.html"), "<html>renderer</html>");
    await writeFile(join(paths.desktop, "dist/client/assets/current.js"), "current chunk");
    await writeFile(join(paths.desktop, "generated/frontend/assets/stale.js"), "stale chunk");
    await writeFile(join(paths.desktop, "resources/tray.png"), "maintained tray");
    await writeFile(join(paths.desktop, "mygo.config.ts"), "maintained config");

    await prepare(true, paths);

    expect(await readFile(join(paths.desktop, "generated/frontend/index.html"), "utf8")).toBe(
      "<html>renderer</html>",
    );
    expect(
      await readFile(join(paths.desktop, "generated/frontend/assets/current.js"), "utf8"),
    ).toBe("current chunk");
    await expect(
      readFile(join(paths.desktop, "generated/frontend/assets/stale.js")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(join(paths.desktop, "generated/version.json"), "utf8"))).toBe(
      config.version,
    );
    expect(await readFile(join(paths.desktop, "resources/tray.png"), "utf8")).toBe(
      "maintained tray",
    );
    expect(await readFile(join(paths.desktop, "mygo.config.ts"), "utf8")).toBe("maintained config");
    expect(
      await readFile(
        join(paths.desktop, "resources/bin", process.platform === "win32" ? "raypx.exe" : "raypx"),
        "utf8",
      ),
    ).toBe("standalone CLI fixture");
    await expect(readFile(join(paths.desktop, "mygo.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      readFile(join(paths.desktop, "native/generated/version.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("provides an embed placeholder for Vite development without inventing a renderer", async () => {
    const paths = await fixture();
    await prepare(false, paths);
    expect(await readFile(join(paths.desktop, "generated/frontend/.keep"), "utf8")).toBe("");
    await expect(
      readFile(join(paths.desktop, "generated/frontend/index.html")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a mismatched standalone CLI before replacing prepared inputs", async () => {
    const paths = await fixture("different-version");
    await expect(prepare(false, paths)).rejects.toThrow("CLI version mismatch");
    await expect(readFile(join(paths.desktop, "generated/version.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

const mac = { platform: "darwin", arch: "arm64", env: {} } as const;
describe("MyGo package target and standalone CLI", () => {
  it("accepts the native target and inherited matching compiler settings", () => {
    expect(assertNativeTarget([], mac)).toEqual({ goos: "darwin", goarch: "arm64" });
    expect(assertNativeTarget(["-platform=darwin/arm64", "-skip-dmg"], mac)).toEqual({
      goos: "darwin",
      goarch: "arm64",
    });
    expect(
      assertNativeTarget(["--platform", "darwin/arm64"], {
        ...mac,
        env: { GOOS: "darwin", GOARCH: "arm64" },
      }),
    ).toEqual({ goos: "darwin", goarch: "arm64" });
    expect(assertNativeTarget([], { platform: "win32", arch: "x64", env: {} })).toEqual({
      goos: "windows",
      goarch: "amd64",
    });
  });
  it.each([
    ["-platform", "windows/arm64"],
    ["--platform=darwin/universal"],
    ["-platform=darwin/arm64,linux/amd64"],
    ["--platform"],
    ["-platform="],
  ])("rejects targets that would carry the wrong CLI: %j", (...supplied) => {
    expect(() => assertNativeTarget(supplied, mac)).toThrow(/matching CLI artifacts/);
  });
  it("rejects inherited cross-compilation settings and unsupported architectures", () => {
    expect(() => assertNativeTarget([], { ...mac, env: { GOOS: "linux" } })).toThrow(
      /match the bundled CLI/,
    );
    expect(() => assertNativeTarget([], { ...mac, env: { GOARCH: "amd64" } })).toThrow(
      /match the bundled CLI/,
    );
    expect(() => assertNativeTarget([], { ...mac, arch: "ia32" })).toThrow(
      /supported standalone CLI target/,
    );
  });
});
