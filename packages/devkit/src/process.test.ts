import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { developmentEnvironment, run } from "./process.js";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("layers local dotenv files beneath the process environment", () => {
  const root = mkdtempSync(join(tmpdir(), "devkit-process-test-"));
  roots.push(root);
  writeFileSync(join(root, ".env.local"), "LOCAL_ONLY=local\nSHARED=local\n");
  writeFileSync(join(root, ".env"), "SHARED=default\nFILE_ONLY=file\n");
  vi.stubEnv("SHARED", undefined);
  vi.stubEnv("FROM_PROCESS", "process");
  const env = developmentEnvironment(root);
  expect(env).toMatchObject({
    LOCAL_ONLY: "local",
    SHARED: "local",
    FILE_ONLY: "file",
    FROM_PROCESS: "process",
  });
  expect(process.env.LOCAL_ONLY).toBeUndefined();
  vi.stubEnv("SHARED", "process");
  expect(developmentEnvironment(root).SHARED).toBe("process");
});

it("reads dotenv syntax literally without expanding references", () => {
  const root = mkdtempSync(join(tmpdir(), "devkit-process-test-"));
  roots.push(root);
  writeFileSync(
    join(root, ".env"),
    '# comment\nexport EXPORTED=1\nQUOTED="a b"\nMULTI="one\ntwo"\nREF=${EXPORTED}x\n',
  );
  expect(developmentEnvironment(root, [".env"])).toMatchObject({
    EXPORTED: "1",
    QUOTED: "a b",
    MULTI: "one\ntwo",
    REF: "${EXPORTED}x",
  });
});

it("resolves successful commands and rejects failures", async () => {
  await expect(run(process.execPath, ["-e", ""], tmpdir())).resolves.toBeUndefined();
  await expect(run(process.execPath, ["-e", "process.exit(3)"], tmpdir())).rejects.toThrow(
    "exited 3",
  );
});
