import { afterEach, expect, it, vi } from "vite-plus/test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { deploymentSmokePlatform, smokeDeployment } from "../../src/validation/deployment-smoke.js";

afterEach(() => vi.unstubAllEnvs());
it("rejects unsupported deployment arguments before creating resources", () => {
  expect(deploymentSmokePlatform([])).toBe("linux/amd64");
  expect(deploymentSmokePlatform(["--platform", "linux/arm64"])).toBe("linux/arm64");
  expect(() => deploymentSmokePlatform(["--env-file", "operator.env"])).toThrow("Usage");
});
it("cleans only its owned builder and network when an image build fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "raypx-smoke-failure-"));
  const repository = resolve(import.meta.dirname, "../../../..");
  try {
    for (const file of ["deploy/build.sh", "apps/api/Dockerfile", "apps/web/Dockerfile"]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      copyFileSync(join(repository, file), join(root, file));
    }
    const log = join(root, "docker-commands");
    writeFileSync(
      join(root, "docker"),
      `#!/bin/sh
printf '%s\n' "$*" >> "$RAYPX_SMOKE_COMMANDS"
case "$1 $2" in
  "buildx build") exit 7 ;;
  "image inspect") exit 1 ;;
esac
`,
      { mode: 0o700 },
    );
    vi.stubEnv("PATH", `${root}:${process.env.PATH}`);
    vi.stubEnv("RAYPX_SMOKE_COMMANDS", log);
    vi.stubEnv("AUTH_SECRET", "operator-secret-must-not-be-logged");
    await expect(smokeDeployment(root, [])).rejects.toThrow("compose-build failed");
    const commands = readFileSync(log, "utf8");
    const created = /network create .* (raypx-deployment-[a-f0-9]+)/.exec(commands)?.[1];
    expect(created).toBeTruthy();
    expect(commands).toContain(`network rm ${created}`);
    expect(commands).toContain(`network rm ${created}-ingress`);
    expect(commands).toContain(`buildx rm --force ${created}`);
    expect(commands).not.toMatch(/prune|volume rm/);
    const evidence = [
      ...new Bun.Glob(".artifacts/deployment/*/commands.json").scanSync({ cwd: root }),
    ];
    expect(evidence).toHaveLength(1);
    expect(readFileSync(join(root, evidence[0]!), "utf8")).not.toContain("operator-secret");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
