import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { sealCliPayload, verifyCliPayload } from "@raypx/tooling/build/cli";
const root = resolve(import.meta.dirname, "../../..");
const directory = resolve(process.env.RAYPX_CLI_PAYLOAD ?? join(root, "apps/cli/dist"));
const [action] = process.argv.slice(2);
async function run(args: string[], cwd = directory) {
  const child = Bun.spawn(args, { cwd, env: process.env, stdout: "inherit", stderr: "inherit" });
  if (await child.exited) throw new Error("CLI distribution command failed");
}
if (action === "verify") {
  const commit = (
    await new Response(
      Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout,
    ).text()
  ).trim();
  await verifyCliPayload(directory, {
    platform: process.platform,
    arch: process.arch,
    commit,
    bunVersion: Bun.version,
  });
} else if (action === "sign") {
  const before = await verifyCliPayload(directory);
  const signingEvidence = join(root, ".artifacts/distribution-signing");
  await mkdir(signingEvidence, { recursive: true });
  await writeFile(join(signingEvidence, "before.json"), JSON.stringify(before, null, 2));
  const files = await readdir(directory, { recursive: true });
  for (const file of files) {
    if (process.platform === "darwin" && file === "raypx") {
      if (process.env.APPLE_SIGNING_IDENTITY)
        await run([
          "/usr/bin/codesign",
          "--force",
          "--timestamp",
          "--options",
          "runtime",
          "--entitlements",
          join(root, "apps/desktop/resources/Entitlements.plist"),
          "--sign",
          process.env.APPLE_SIGNING_IDENTITY,
          join(directory, file),
        ]);
    } else if (
      process.platform === "win32" &&
      /\.(exe|dll)$/i.test(file) &&
      process.env.RAYPX_DESKTOP_SIGNING_THUMBPRINT
    ) {
      await run([
        process.env.RAYPX_WINDOWS_SIGNTOOL ?? "signtool",
        "sign",
        "/fd",
        "sha256",
        "/tr",
        "http://timestamp.digicert.com",
        "/td",
        "sha256",
        "/sha1",
        process.env.RAYPX_DESKTOP_SIGNING_THUMBPRINT,
        join(directory, file),
      ]);
    }
  }
  for (const file of files) {
    if (process.platform === "darwin" && process.env.APPLE_SIGNING_IDENTITY && file === "raypx")
      await run(["/usr/bin/codesign", "--verify", "--strict", join(directory, file)]);
    if (
      process.platform === "win32" &&
      process.env.RAYPX_DESKTOP_SIGNING_THUMBPRINT &&
      /\.(exe|dll)$/i.test(file)
    )
      await run([
        process.env.RAYPX_WINDOWS_SIGNTOOL ?? "signtool",
        "verify",
        "/pa",
        join(directory, file),
      ]);
  }
  await sealCliPayload(directory);
  const after = await verifyCliPayload(directory, { builtAt: before.builtAt });
  await writeFile(
    join(signingEvidence, "after.json"),
    JSON.stringify(
      {
        manifest: after,
        signing:
          process.platform === "darwin"
            ? process.env.APPLE_SIGNING_IDENTITY
              ? "Developer ID verified"
              : "unsigned"
            : process.env.RAYPX_DESKTOP_SIGNING_THUMBPRINT
              ? "Authenticode verified"
              : "unsigned",
      },
      null,
      2,
    ),
  );
} else if (action === "notarize") {
  await verifyCliPayload(directory);
  if (process.platform === "darwin" && process.env.RAYPX_NOTARY_PROFILE) {
    const output = join(root, ".artifacts/distribution-notary");
    await mkdir(output, { recursive: true });
    const submission = join(output, "cli-submission.zip");
    try {
      await run(["/usr/bin/ditto", "-c", "-k", "--keepParent", directory, submission]);
      const child = Bun.spawn(
        [
          "/usr/bin/xcrun",
          "notarytool",
          "submit",
          submission,
          "--keychain-profile",
          process.env.RAYPX_NOTARY_PROFILE,
          "--wait",
          "--output-format",
          "json",
        ],
        { stdout: "pipe", stderr: "inherit" },
      );
      const evidence = await new Response(child.stdout).text();
      await writeFile(join(output, "notarization.json"), evidence);
      if ((await child.exited) || JSON.parse(evidence).status !== "Accepted")
        throw new Error("Standalone CLI notarization was not accepted");
      // Mach-O executables cannot be stapled. Gatekeeper retrieves the ticket by code identity.
      await verifyCliPayload(directory);
    } finally {
      await rm(submission, { force: true });
    }
  }
} else if (action === "archive") {
  const manifest = await verifyCliPayload(directory);
  if (
    !(
      (manifest.platform === "darwin" && manifest.arch === "arm64") ||
      (manifest.platform === "win32" && manifest.arch === "x64")
    )
  )
    throw new Error("CLI release archives support macOS arm64 and Windows x64");
  const output = join(root, ".artifacts/distribution");
  await mkdir(output, { recursive: true });
  const name = `raypx-${manifest.version}-${manifest.platform}-${manifest.arch}.${process.platform === "win32" ? "zip" : "tar.gz"}`;
  const archive = join(output, name);
  if (process.platform === "win32") {
    await rm(archive, { force: true });
    process.env.RAYPX_CLI_ARCHIVE = archive;
    process.env.RAYPX_CLI_ARCHIVE_SOURCE = directory;
    await run(
      [
        join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe"),
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:RAYPX_CLI_ARCHIVE_SOURCE, $env:RAYPX_CLI_ARCHIVE, [IO.Compression.CompressionLevel]::Optimal, $false)",
      ],
      directory,
    );
  } else await run(["/usr/bin/tar", "-czf", archive, "."]);
  await writeFile(
    archive + ".sha256",
    createHash("sha256")
      .update(await readFile(archive))
      .digest("hex") +
      "  " +
      name +
      "\n",
  );
} else throw new Error("Usage: distribution.ts verify|sign|notarize|archive");
