import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { checkRelease } from "../../../scripts/native/check-release";

const roots: string[] = [];
function fixture(bytes: Buffer | string = "current clean release") {
  const root = mkdtempSync(join(tmpdir(), "raypx-release-gate-"));
  roots.push(root);
  const directory = join(root, "target/release");
  mkdirSync(join(directory, "deps"), { recursive: true });
  mkdirSync(join(directory, ".fingerprint"));
  const binary = join(directory, "raypx-desktop.exe");
  writeFileSync(binary, bytes);
  function variant(id: string, contents: Buffer | string, features = '["default"]') {
    const path = join(directory, ".fingerprint", `raypx-desktop-${id}`);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(directory, "deps", `raypx_desktop-${id}.exe`), contents);
    // Shape captured from a real Cargo 1.97 release fingerprint. In particular,
    // declared_features lists smoke even when the compiled features do not.
    writeFileSync(
      join(path, "bin-raypx-desktop.json"),
      JSON.stringify({
        rustc: 1,
        features,
        declared_features: '["default", "native-smoke"]',
        target: 2,
        profile: 3,
        deps: [],
        local: [
          {
            CheckDepInfo: {
              dep_info: `release/.fingerprint/raypx-desktop-${id}/dep-bin-raypx-desktop`,
              checksum: false,
            },
          },
        ],
        rustflags: [],
        compile_kind: 0,
      }),
    );
    return path;
  }
  function msvcVariant(id: string, contents: Buffer | string, features = '["default"]') {
    const path = variant(id, contents, features);
    rmSync(join(directory, "deps", `raypx_desktop-${id}.exe`));
    writeFileSync(join(directory, "deps/raypx_desktop.exe"), contents);
    return path;
  }
  return { root, directory, binary, variant, msvcVariant };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("checks the binary's matching Cargo variant and ignores stale smoke fingerprints", async () => {
  const f = fixture();
  f.variant("0000000000000001", "old native-smoke variant", '["default", "native-smoke"]');
  f.variant("0000000000000002", "current clean release");
  const result = await checkRelease({ releaseDirectory: f.directory, platform: "win32" });
  expect(result.features).toEqual(["default"]);
  expect(result.fingerprint).toBe("raypx-desktop-0000000000000002");
  expect(result.checked).toBe("Windows packaging input executable");
});

it("rejects smoke compilation even when an older default variant is still cached", async () => {
  const f = fixture("current variant with its marker removed");
  f.variant("0000000000000001", "old clean release");
  f.variant(
    "0000000000000002",
    "current variant with its marker removed",
    '["default", "native-smoke"]',
  );
  await expect(checkRelease({ releaseDirectory: f.directory, platform: "win32" })).rejects.toThrow(
    "compiled with native-smoke",
  );
});

it("matches MSVC's unhashed production artifact to its sole bin fingerprint, excluding lib/test records", async () => {
  const f = fixture();
  f.msvcVariant("0000000000000001", "current clean release");
  // Cargo uses package-short-hash fingerprints and an unhashed crate_name.exe
  // for local MSVC builds, while lib/test units retain their separate records.
  for (const [id, name] of [
    ["0000000000000002", "lib-raypx_desktop.json"],
    ["0000000000000003", "test-bin-raypx-desktop.json"],
  ]) {
    const path = f.variant(id!, "current clean release", '["default", "native-smoke"]');
    const record = readFileSync(join(path, "bin-raypx-desktop.json"));
    rmSync(join(path, "bin-raypx-desktop.json"));
    writeFileSync(join(path, name!), record);
  }
  expect(
    (await checkRelease({ releaseDirectory: f.directory, platform: "win32" })).fingerprint,
  ).toBe("raypx-desktop-0000000000000001");
});

it("rejects native-smoke in the actual MSVC unhashed build's fingerprint", async () => {
  const f = fixture();
  f.msvcVariant("0000000000000001", "current clean release", '["default", "native-smoke"]');
  await expect(checkRelease({ releaseDirectory: f.directory, platform: "win32" })).rejects.toThrow(
    "compiled with native-smoke",
  );
});

it("does not choose a fingerprint by age or feature list when an MSVC bin record is ambiguous", async () => {
  const f = fixture();
  f.msvcVariant("0000000000000001", "current clean release");
  f.variant("0000000000000002", "older build");
  await expect(checkRelease({ releaseDirectory: f.directory, platform: "win32" })).rejects.toThrow(
    /ambiguous build evidence: .*"binFingerprints":\["raypx-desktop-000000000000000[12]","raypx-desktop-000000000000000[12]"\]/,
  );
});

it("requires the unhashed MSVC artifact's code to match the actual packaging input", async () => {
  const f = fixture();
  f.msvcVariant("0000000000000001", "stale executable");
  await expect(checkRelease({ releaseDirectory: f.directory, platform: "win32" })).rejects.toThrow(
    /"matches":\[\],"unhashed":"different"/,
  );
});

it.each([
  Buffer.from("RAYPX_NATIVE_SMOKE_SOCKET"),
  Buffer.from("RAYPX_NATIVE_SMOKE_SOCKET", "utf16le"),
])("rejects the socket marker independently of claimed Cargo features", async (bytes) => {
  const f = fixture(bytes);
  f.variant("0000000000000001", bytes);
  await expect(checkRelease({ releaseDirectory: f.directory, platform: "win32" })).rejects.toThrow(
    "native-smoke socket marker",
  );
});

it("fails closed when matching build evidence is missing or ambiguous", async () => {
  const f = fixture();
  f.variant("0000000000000001", "different cached build");
  await expect(checkRelease({ releaseDirectory: f.directory, platform: "win32" })).rejects.toThrow(
    "missing or ambiguous build evidence",
  );
  f.variant("0000000000000002", "current clean release");
  f.variant("0000000000000003", "current clean release");
  await expect(checkRelease({ releaseDirectory: f.directory, platform: "win32" })).rejects.toThrow(
    "missing or ambiguous build evidence",
  );
});

it("does not inspect the separate smoke target and refuses using it as a release", async () => {
  const f = fixture();
  f.variant("0000000000000001", "current clean release");
  const smoke = join(f.root, "target/native-smoke/release");
  mkdirSync(smoke, { recursive: true });
  writeFileSync(join(smoke, "raypx-desktop.exe"), "RAYPX_NATIVE_SMOKE_SOCKET");
  expect(
    (await checkRelease({ releaseDirectory: f.directory, platform: "win32" })).features,
  ).toEqual(["default"]);
  await expect(checkRelease({ releaseDirectory: smoke, platform: "win32" })).rejects.toThrow(
    "outside native-smoke",
  );
});

it("refuses an unknown features representation instead of treating it as an empty list", async () => {
  const f = fixture();
  f.variant("0000000000000001", "current clean release", "null");
  await expect(checkRelease({ releaseDirectory: f.directory, platform: "win32" })).rejects.toThrow(
    "Unsupported Cargo fingerprint features record",
  );
});

it("also checks the actual macOS app binary, not just an earlier Cargo output", async () => {
  const f = fixture();
  writeFileSync(join(f.directory, "raypx-desktop"), "current clean release");
  f.variant("0000000000000001", "current clean release");
  copyFileSync(
    join(f.directory, "deps/raypx_desktop-0000000000000001.exe"),
    join(f.directory, "deps/raypx_desktop-0000000000000001"),
  );
  const app = join(f.directory, "bundle/macos/Raypx.app/Contents/MacOS/raypx-desktop");
  mkdirSync(join(app, ".."), { recursive: true });
  writeFileSync(app, "stale clean package");
  await expect(checkRelease({ releaseDirectory: f.directory, platform: "darwin" })).rejects.toThrow(
    "does not match",
  );
  writeFileSync(app, "RAYPX_NATIVE_SMOKE_SOCKET");
  await expect(checkRelease({ releaseDirectory: f.directory, platform: "darwin" })).rejects.toThrow(
    "native-smoke socket marker",
  );
});

/** A small PE32+ image with one section; signing changes only its certificate metadata. */
function pe(signed: boolean) {
  const bytes = Buffer.alloc(signed ? 1056 : 1024);
  bytes.write("MZ");
  bytes.writeUInt32LE(128, 60);
  bytes.write("PE\0\0", 128, "ascii");
  bytes.writeUInt16LE(1, 134);
  bytes.writeUInt16LE(240, 148);
  bytes.writeUInt16LE(0x20b, 152);
  bytes.writeUInt32LE(signed ? 12345 : 0, 216);
  bytes.writeUInt32LE(512, 408);
  bytes.writeUInt32LE(512, 412);
  bytes.write("compiled code", 512);
  if (signed) {
    bytes.writeUInt32LE(1024, 296);
    bytes.writeUInt32LE(32, 300);
    bytes.fill(9, 1024);
  }
  return bytes;
}

it.each(["variant", "msvcVariant"] as const)(
  "matches Authenticode-signed packaging input to original Cargo code without changing either: %s",
  async (layout) => {
    const signed = pe(true);
    const f = fixture(signed);
    f[layout]("0000000000000001", pe(false));
    expect(
      (await checkRelease({ releaseDirectory: f.directory, platform: "win32" })).features,
    ).toEqual(["default"]);
    expect(readFileSync(f.binary)).toEqual(signed);
  },
);

it("rejects a PE certificate range overlapping compiled code", async () => {
  const bytes = pe(true);
  bytes.writeUInt32LE(512, 296);
  const f = fixture(bytes);
  await expect(checkRelease({ releaseDirectory: f.directory, platform: "win32" })).rejects.toThrow(
    "Invalid release PE certificate range",
  );
});

it.skipIf(process.platform !== "darwin")(
  "compares differently signed Mach-O copies without launching or modifying them",
  async () => {
    const f = fixture();
    const original = readFileSync("/usr/bin/true");
    f.variant("0000000000000001", original);
    const artifact = join(f.directory, "deps/raypx_desktop-0000000000000001");
    writeFileSync(artifact, original);
    const binary = join(f.directory, "raypx-desktop");
    copyFileSync("/usr/bin/true", binary);
    const app = join(f.directory, "bundle/macos/Raypx.app/Contents/MacOS/raypx-desktop");
    mkdirSync(join(app, ".."), { recursive: true });
    copyFileSync(binary, app);
    for (const [path, identifier] of [
      [binary, "raypx-release-test"],
      [app, "raypx-package-test"],
    ]) {
      const command = Bun.spawn(
        ["/usr/bin/codesign", "--force", "--sign", "-", "--identifier", identifier!, path!],
        {
          stdin: "ignore",
          stdout: "ignore",
          stderr: "ignore",
        },
      );
      expect(await command.exited).toBe(0);
    }
    const before = readFileSync(app);
    expect(
      (await checkRelease({ releaseDirectory: f.directory, platform: "darwin" })).features,
    ).toEqual(["default"]);
    expect(readFileSync(app)).toEqual(before);
  },
);
