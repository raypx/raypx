import { afterEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDockerComputerProvider } from "./docker.js";
import { filePreviewScript } from "./file-preview.js";

const owned: string[] = [];
afterEach(() => {
  for (const root of owned.splice(0)) rmSync(root, { recursive: true, force: true });
});
it("reads only a bounded prefix through no-follow directory descriptors", () => {
  const root = mkdtempSync(join(tmpdir(), "raypx-file-preview-"));
  owned.push(root);
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  writeFileSync(join(workspace, "file"), "hello world");
  writeFileSync(join(workspace, "empty"), "");
  writeFileSync(join(root, "private"), "outside");
  symlinkSync(join(root, "private"), join(workspace, "link"));
  symlinkSync(root, join(workspace, "directory-link"));
  // The same reader executes inside the computer image in production; only its root changes.
  const script = filePreviewScript.replace('"/home/computer/workspace"', JSON.stringify(workspace));
  function read(path: string, limit = 5) {
    return JSON.parse(
      execFileSync("python3", ["-I", "-c", script, path, String(limit)], { encoding: "utf8" }),
    ) as unknown;
  }
  expect(read("file")).toEqual({ bytes: "aGVsbG8=", size: 11, truncated: true });
  expect(read("file", 11)).toEqual({
    bytes: Buffer.from("hello world").toString("base64"),
    size: 11,
    truncated: false,
  });
  expect(read("empty")).toEqual({ bytes: "", size: 0, truncated: false });
  expect(read("missing")).toEqual({ code: "NOT_FOUND" });
  expect(read("link")).toEqual({ code: "INVALID_INPUT" });
  expect(read("directory-link/private")).toEqual({ code: "INVALID_INPUT" });
});

it("uses only bounded private execution transport and refuses unsafe paths before dispatch", async () => {
  const requests: { command?: { executable: string; argv: string[]; outputBudget: number } }[] = [];
  const response = { bytes: "aGVsbG8=", size: 11, truncated: true };
  const request = vi.fn(async (input: Request) => {
    requests.push((await input.json()) as (typeof requests)[number]);
    return new Response(
      [
        { kind: "stdout", bytes: Buffer.from(JSON.stringify(response)).toString("base64") },
        { kind: "exit", status: 0, cancelled: false, truncated: false },
      ]
        .map((event) => JSON.stringify(event))
        .join("\n") + "\n",
    );
  });
  const provider = createDockerComputerProvider({
    url: "https://supervisor.example.test",
    token: "t".repeat(32),
    fetch: request,
  });
  const ref = { id: crypto.randomUUID(), generation: 1 };
  expect(await provider.readFile!(ref, "file", 5)).toEqual(response);
  expect(requests[0]?.command).toMatchObject({
    executable: "/usr/local/bin/python3",
    outputBudget: 1032,
  });
  expect(requests[0]?.command?.argv).toEqual(["-I", "-c", filePreviewScript, "file", "5"]);
  for (const path of [
    "../private",
    "/private",
    "link/../../private",
    "bad\\path",
    "bad\0path",
    ".",
  ])
    await expect(provider.readFile!(ref, path, 5)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(request).toHaveBeenCalledTimes(1);
});
