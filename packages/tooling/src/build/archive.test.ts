import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, it, expect, vi } from "vite-plus/test";
import { extractArchive } from "./archive.ts";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("extracts compressed package resources and ignores Windows PATH tar shims", async () => {
  const root = mkdtempSync(join(tmpdir(), "raypx 中文 # archive "));
  roots.push(root);
  const destination = join(root, "解压目录");
  mkdirSync(destination);
  const archive = join(root, "资源.tgz");
  // A fixed gzip/ustar fixture containing package/LICENSE; no archive writer is required.
  writeFileSync(
    archive,
    Buffer.from(
      "H4sIAAAAAAAC/+3SMQrCQBCF4ak9xd7AiVm8gKQIBJucYFkWDUoI7qbw9tloIaRPCPh/zRte85oZnH+4Wzg29aW6tpWsQbOztZ/Mlqlann733BdaWhWjsoExJvfK8/Kf4rtP95A6b4bvJ5hn50Mfw0EAAAAAAAAAAAAAAAAAADs2AfLqvf0AKAAA",
      "base64",
    ),
  );
  if (process.platform === "win32") {
    writeFileSync(join(root, "tar.cmd"), "@exit /b 88\r\n");
    vi.stubEnv("PATH", `${root}${delimiter}${process.env.PATH ?? ""}`);
  }
  await extractArchive(archive, destination, 1);
  expect(readFileSync(join(destination, "LICENSE"), "utf8")).toBe("synthetic package license\n");
});

it.skipIf(process.platform !== "win32")("extracts ZIP releases through Unicode paths", async () => {
  const root = mkdtempSync(join(tmpdir(), "raypx 中文 # archive "));
  roots.push(root);
  const destination = join(root, "解压目录");
  mkdirSync(destination);
  const archive = join(root, "资源.zip");
  // A fixed ZIP fixture containing LICENSE, matching the Windows release format.
  writeFileSync(
    archive,
    Buffer.from(
      "UEsDBBQAAAAAAAAAZl1cixSpGgAAABoAAAAHAAAATElDRU5TRXN5bnRoZXRpYyBwYWNrYWdlIGxpY2Vuc2UKUEsBAhQDFAAAAAAAAABmXVyLFKkaAAAAGgAAAAcAAAAAAAAAAAAAAIABAAAAAExJQ0VOU0VQSwUGAAAAAAEAAQA1AAAAPwAAAAAA",
      "base64",
    ),
  );
  await extractArchive(archive, destination);
  expect(readFileSync(join(destination, "LICENSE"), "utf8")).toBe("synthetic package license\n");
});
