import { runProcessSync } from "@raypx/runtime-node/process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";

it("packages the Desktop main executable when the smoke fixture is enabled", async () => {
  const source = fileURLToPath(new URL("../../../src-tauri/", import.meta.url));
  const metadata = runProcessSync(
    ["cargo", "metadata", "--locked", "--no-deps", "--format-version", "1"],
    { cwd: source, stdout: "pipe", stderr: "pipe" },
  );
  expect({
    code: metadata.exitCode,
    error: new TextDecoder().decode(metadata.stderr),
  }).toMatchObject({
    code: 0,
  });
  const {
    packages,
  }: {
    packages: {
      name: string;
      default_run: string | null;
      features: Record<string, string[]>;
      targets: { name: string; kind: string[]; src_path: string; "required-features"?: string[] }[];
    }[];
  } = JSON.parse(new TextDecoder().decode(metadata.stdout));
  const manifest = packages.find((candidate) => candidate.name === "raypx-desktop")!;
  const binaries = manifest.targets.filter((target) => target.kind.includes("bin"));
  const root = await mkdtemp(join(tmpdir(), "raypx-tauri-selection-"));
  try {
    const native = join(root, "src-tauri");
    await mkdir(native);
    for (const binary of binaries) {
      const path = join(native, relative(source, binary.src_path));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "fn main() {}\n");
    }
    await writeFile(
      join(native, "Cargo.toml"),
      [
        "[package]",
        `name = ${JSON.stringify(manifest.name)}`,
        'version = "0.1.0"',
        'edition = "2024"',
        ...(manifest.default_run ? [`default-run = ${JSON.stringify(manifest.default_run)}`] : []),
        "[features]",
        ...Object.keys(manifest.features).map(
          (name) =>
            `${name} = ${JSON.stringify(name === "default" ? manifest.features[name] : [])}`,
        ),
        ...binaries.flatMap((binary) => [
          "[[bin]]",
          `name = ${JSON.stringify(binary.name)}`,
          `path = ${JSON.stringify(relative(source, binary.src_path))}`,
          `required-features = ${JSON.stringify(binary["required-features"] ?? [])}`,
        ]),
      ].join("\n"),
    );
    await mkdir(join(root, "frontend"));
    await writeFile(join(root, "frontend/index.html"), "<html></html>");
    await writeFile(
      join(native, "tauri.conf.json"),
      JSON.stringify({
        productName: "Selection Test",
        version: "0.1.0",
        identifier: "com.raypx.test",
        mainBinaryName: manifest.name,
        build: { frontendDist: join(root, "frontend") },
      }),
    );
    const windows = process.platform === "win32";
    const runner = join(root, windows ? "runner.cmd" : "runner");
    await writeFile(
      runner,
      windows
        ? '@echo off\r\nmkdir "%CARGO_TARGET_DIR%\\debug"\r\necho desktop-main>"%CARGO_TARGET_DIR%\\debug\\raypx-desktop.exe"\r\necho native-fixture>"%CARGO_TARGET_DIR%\\debug\\raypx-native-fixture.exe"\r\nexit /b 0\r\n'
        : '#!/bin/sh\nmkdir -p "$CARGO_TARGET_DIR/debug"\nprintf desktop-main > "$CARGO_TARGET_DIR/debug/raypx-desktop"\nprintf native-fixture > "$CARGO_TARGET_DIR/debug/raypx-native-fixture"\n',
      { mode: 0o700 },
    );
    const result = runProcessSync(
      [
        process.execPath,
        "--input-type=module",
        "-e",
        `const { run } = await import(${JSON.stringify(import.meta.resolve("@tauri-apps/cli"))}); await run(process.argv.slice(1));`,
        "build",
        "--debug",
        "--no-bundle",
        "--features",
        "native-smoke",
        "--runner",
        runner,
      ],
      {
        cwd: root,
        env: { ...process.env, CARGO_TARGET_DIR: join(root, "target") },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect({ code: result.exitCode, error: new TextDecoder().decode(result.stderr) }).toMatchObject(
      {
        code: 0,
      },
    );
    expect(
      (
        await readFile(join(root, `target/debug/raypx-desktop${windows ? ".exe" : ""}`), "utf8")
      ).trim(),
    ).toBe("desktop-main");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
