import { expect, it } from "vite-plus/test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../../../..");
it.each([false, true])(
  "replaces services only after a successful migration (failure=%s)",
  (fail) => {
    const directory = mkdtempSync(join(tmpdir(), "raypx-deploy-order-"));
    try {
      const log = join(directory, "commands"),
        environment = join(directory, ".env");
      writeFileSync(environment, "COMPOSE_PROJECT_NAME=isolated-test\n");
      writeFileSync(
        join(directory, "docker"),
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "$RAYPX_DEPLOY_TEST_LOG"\ncase "$*" in *"run --rm migrate"*) if [ "$RAYPX_DEPLOY_TEST_FAIL" = true ]; then exit 7; fi ;; esac\n',
        { mode: 0o700 },
      );
      const result = spawnSync("/bin/sh", [join(root, "deploy/update.sh"), environment], {
        env: {
          ...process.env,
          PATH: `${directory}:/usr/bin:/bin`,
          RAYPX_DEPLOY_TEST_LOG: log,
          RAYPX_DEPLOY_TEST_FAIL: String(fail),
        },
        encoding: "utf8",
      });
      const commands = readFileSync(log, "utf8").trim().split("\n");
      expect(commands[0]).toContain("config --quiet");
      expect(result.status).toBe(fail ? 7 : 0);
      expect(commands.filter((line) => /--wait (api|web)/.test(line)).length).toBe(fail ? 0 : 2);
      expect(
        commands
          .slice(1)
          .map((line) =>
            line.slice(
              line.indexOf("up -d") >= 0 ? line.indexOf("up -d") : line.indexOf("run --rm"),
            ),
          ),
      ).toEqual(
        fail
          ? ["up -d postgres", "run --rm migrate"]
          : [
              "up -d postgres",
              "run --rm migrate",
              "up -d --no-deps --wait api",
              "up -d --no-deps --wait web",
            ],
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
it("rejects invalid release tags before invoking Docker", () => {
  for (const release of ["bad/release", "bad release", "x".repeat(129)]) {
    const result = spawnSync("/bin/sh", [join(root, "deploy/build.sh")], {
      env: {
        ...process.env,
        COMPOSE_PROJECT_NAME: "raypx-test",
        APP_HOST: "app.example.test",
        RAYPX_RELEASE: release,
        PATH: "/usr/bin:/bin",
      },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/RAYPX_RELEASE|128 characters/);
    expect(result.stderr).not.toContain("not found");
  }
});
it("discovers build manifests without copying application code or secrets", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-metadata-"));
  try {
    const source = join(directory, "source"),
      output = join(directory, "output");
    mkdirSync(join(source, "modules/one"), { recursive: true });
    writeFileSync(join(source, "package.json"), JSON.stringify({ workspaces: ["modules/*"] }));
    writeFileSync(join(source, "bun.lock"), "fixture");
    writeFileSync(join(source, "modules/one/package.json"), '{"name":"one"}');
    writeFileSync(join(source, "modules/one/source.ts"), "private source");
    const result = spawnSync(
      process.execPath,
      [join(root, "deploy/manifests.ts"), source, output],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(readFileSync(join(output, "modules/one/package.json"), "utf8")).toContain('"one"');
    expect(() => readFileSync(join(output, "modules/one/source.ts"))).toThrow(/ENOENT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
