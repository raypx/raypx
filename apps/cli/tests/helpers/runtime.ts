import { closeProfileStorage } from "./sqlite";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vite-plus/test";
import { createRuntime, type LocalRuntime } from "../../src/runtime/index.js";
import type { RecordDiagnostic } from "../../src/diagnostics.js";

export function runtimeFixtures() {
  const roots: string[] = [];
  const runtimes: LocalRuntime[] = [];
  async function fixture(recordDiagnostic?: RecordDiagnostic) {
    const dir = await mkdtemp(join(tmpdir(), "raypx-local-test-"));
    roots.push(dir);
    const authorized = join(dir, "files");
    await mkdir(authorized);
    const runtime = createRuntime({
      dataDir: dir,
      ...(recordDiagnostic ? { recordDiagnostic } : {}),
    });
    runtimes.push(runtime);
    const grant = await runtime.files.register(authorized);
    return { dir, authorized, runtime, grant };
  }
  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
    await Promise.all(
      roots.splice(0).map((path) => {
        closeProfileStorage(path);
        return rm(path, { recursive: true, force: true });
      }),
    );
  });
  return { fixture, runtimes };
}
