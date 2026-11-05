import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";

it("loads the native check runner without JavaScript workspace dependencies", () => {
  const desktop = mkdtempSync(join(tmpdir(), "raypx-go-check-"));
  try {
    const scripts = join(desktop, "scripts/native");
    mkdirSync(scripts, { recursive: true });
    for (const name of ["mygo", "packager", "prepare-cli", "signing"])
      copyFileSync(
        join(import.meta.dirname, `../../../scripts/native/${name}.ts`),
        join(scripts, `${name}.ts`),
      );
    writeFileSync(join(desktop, "package.json"), '{"type":"module","version":"0.1.0"}');
    const result = spawnSync(
      process.execPath,
      ["--eval", 'await import("./scripts/native/mygo.ts");'],
      { cwd: desktop, encoding: "utf8", timeout: 10_000 },
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  } finally {
    rmSync(desktop, { recursive: true, force: true });
  }
});
