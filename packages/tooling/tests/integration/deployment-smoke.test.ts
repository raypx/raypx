import { afterEach, expect, it, vi } from "vite-plus/test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { deploymentSmokePlatform, smokeDeployment } from "../../src/validation/deployment-smoke.js";

function prepareBuildInputs(root: string) {
  const repository = resolve(import.meta.dirname, "../../../..");
  for (const file of [
    "deploy/build.sh",
    "apps/api/Dockerfile",
    "apps/web/Dockerfile",
    "infra/relay/Dockerfile",
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(repository, file), join(root, file));
  }
  const manifest = JSON.parse(readFileSync(join(repository, "apps/api/package.json"), "utf8"));
  writeFileSync(
    join(root, "apps/api/package.json"),
    JSON.stringify({
      scripts: { "deployment:fixture:build": manifest.scripts["deployment:fixture:build"] },
    }),
  );
  mkdirSync(join(root, "apps/api/tests/fixtures"), { recursive: true });
  writeFileSync(
    join(root, "apps/api/tests/fixtures/deployment.ts"),
    'console.log("synthetic fixture");\n',
  );
}

afterEach(() => vi.unstubAllEnvs());
it("rejects unsupported deployment arguments before creating resources", () => {
  expect(deploymentSmokePlatform([])).toBe("linux/amd64");
  expect(deploymentSmokePlatform(["--platform", "linux/arm64"])).toBe("linux/arm64");
  expect(() => deploymentSmokePlatform(["--env-file", "operator.env"])).toThrow("Usage");
});
it("cleans only its owned builder and network when an image build fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "raypx-smoke-failure-"));
  try {
    prepareBuildInputs(root);
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

it("seeds the isolated database from a bundle without exporting the API development image", async () => {
  const root = mkdtempSync(join(tmpdir(), "raypx-smoke-bundle-"));
  try {
    prepareBuildInputs(root);
    const log = join(root, "docker-commands");
    writeFileSync(
      join(root, "docker"),
      `#!/bin/sh
previous=''
for argument in "$@"; do
  if [ "$previous" = '-e' ]; then
    printf '%s ' "\${argument%%=*}=REDACTED" >> "$RAYPX_SMOKE_COMMANDS"
  else
    printf '%s ' "$argument" >> "$RAYPX_SMOKE_COMMANDS"
  fi
  previous="$argument"
done
printf '\\n' >> "$RAYPX_SMOKE_COMMANDS"
case "$*" in
  *'/fixture:smoke'*) exit 31 ;;
  *'/deployment-fixture.mjs'*) exit 9 ;;
esac
case "$1 $2" in
  'image inspect') echo 'owned-image@sha256:synthetic' ;;
esac
`,
      { mode: 0o700 },
    );
    vi.stubEnv("PATH", `${root}:${process.env.PATH}`);
    vi.stubEnv("RAYPX_SMOKE_COMMANDS", log);
    await expect(smokeDeployment(root, [])).rejects.toThrow("account-fixture failed (9)");
    const commands = readFileSync(log, "utf8");
    expect(commands).not.toMatch(/fixture:smoke|--target build|prune|volume rm/);
    const seed = commands.split("\n").find((line) => line.includes("/deployment-fixture.mjs"));
    expect(seed).toContain("--network raypx-deployment-");
    expect(seed).toContain("raypx/api-migrate:");
    expect(seed).toContain("dst=/deployment-fixture.mjs,readonly");
    expect(seed).toContain("bun --no-env-file /deployment-fixture.mjs");
    expect(commands).not.toContain("127.0.0.1:");
    expect(commands).toContain("buildx rm --force raypx-deployment-");
    const evidence = [
      ...new Bun.Glob(".artifacts/deployment/*/commands.json").scanSync({ cwd: root }),
    ];
    const results = JSON.parse(readFileSync(join(root, evidence[0]!), "utf8"));
    expect(results).toContainEqual(expect.objectContaining({ label: "fixture-bundle", code: 0 }));
    expect(results).toContainEqual(expect.objectContaining({ label: "account-fixture", code: 9 }));
    expect(results).toContainEqual(expect.objectContaining({ label: "cleanup-builder", code: 0 }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
