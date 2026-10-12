import { describe, expect, it, vi } from "vite-plus/test";

import { renderDoctorReport } from "./report.js";
import { runDoctor, type DoctorDependencies } from "./checks.js";

function dependencies(overrides: Partial<DoctorDependencies> = {}): DoctorDependencies {
  return {
    repositoryRoot: "/repo",
    readFile: vi.fn(async () =>
      JSON.stringify({
        name: "raypx",
        packageManager: "bun@1.4.0",
        devEngines: {
          packageManager: { name: "bun", version: "1.4.0" },
          runtime: { name: "bun", version: "1.4.0" },
        },
      }),
    ),
    pathExists: vi.fn(async () => true),
    probe: vi.fn(async (command) => {
      if (command[0] === "bun") return "1.4.0\n";
      return `${command[0]} available`;
    }),
    validateEnvironment: vi.fn(),
    ...overrides,
  };
}

describe("runDoctor", () => {
  it("passes when core and optional prerequisites are available", async () => {
    const report = await runDoctor(dependencies());

    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(0);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Bun", status: "ok" }),
        expect.objectContaining({ name: "environment", status: "ok" }),
        expect.objectContaining({
          name: "Electrobun",
          status: "ok",
          detail: "local bootstrap is installed; SDK is available at apps/desktop/.hutch/devkit",
        }),
      ]),
    );
  });

  it("fails core version and environment checks without exposing values", async () => {
    const report = await runDoctor(
      dependencies({
        probe: vi.fn(async (command) => {
          if (command[0] === "bun") return "1.3.13";
          return "available";
        }),
        validateEnvironment: vi.fn(() => {
          throw new Error("Invalid environment variables:\nDATABASE_URL: Invalid URL");
        }),
      }),
    );
    const output = renderDoctorReport(report);

    expect(report.errors).toBe(2);
    expect(output).toContain("expected 1.4.0, found 1.3.13");
    expect(output).toContain("DATABASE_URL: Invalid URL");
    expect(output).not.toContain("postgres://");
  });

  it("requires the bundled Vite+ runner and never a standalone Vitest binary", async () => {
    const deps = dependencies({
      pathExists: vi.fn(async (path) => !path.endsWith("/vitest")),
    });
    const report = await runDoctor(deps);
    expect(report.errors).toBe(0);
    expect(deps.pathExists).toHaveBeenCalledWith("/repo/node_modules/.bin/vp");
    expect(deps.pathExists).not.toHaveBeenCalledWith("/repo/node_modules/.bin/vitest");

    const missingRunner = await runDoctor(
      dependencies({ pathExists: vi.fn(async (path) => !path.endsWith("/vp")) }),
    );
    expect(missingRunner.checks).toContainEqual({
      name: "dependencies",
      status: "error",
      detail: "missing binaries: vp",
    });
  });

  it("warns instead of failing when optional tools are absent", async () => {
    const report = await runDoctor(
      dependencies({
        pathExists: vi.fn(
          async (path) => path !== "/repo/apps/desktop/node_modules/.bin/electrobun",
        ),
        probe: vi.fn(async (command) => {
          if (command[0] === "bun") return "1.4.0";
          throw new Error("missing");
        }),
      }),
    );

    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(2);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Electrobun", status: "warn" }),
        expect.objectContaining({ name: "Docker", status: "warn" }),
      ]),
    );
  });

  it("checks the local desktop bootstrap without running it or downloading its SDK", async () => {
    const deps = dependencies({
      pathExists: vi.fn(async (path) => path !== "/repo/apps/desktop/.hutch/devkit/.complete"),
    });
    const report = await runDoctor(deps);

    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(0);
    expect(report.checks).toContainEqual({
      name: "Electrobun",
      status: "ok",
      detail:
        "local bootstrap is installed; prepare the SDK with bun run --cwd apps/desktop native:prepare",
    });
    expect(deps.probe).toHaveBeenCalledTimes(2);
    expect(deps.probe).toHaveBeenCalledWith(["bun", "--version"]);
    expect(deps.probe).toHaveBeenCalledWith(["docker", "--version"]);
    expect(deps.pathExists).toHaveBeenCalledWith("/repo/apps/desktop/node_modules/.bin/electrobun");
  });
  it("rejects missing or divergent runtime pins without consulting another executor", async () => {
    for (const runtime of [undefined, { name: "bun", version: "1.4.2" }]) {
      const deps = dependencies({
        readFile: vi.fn(async () =>
          JSON.stringify({
            name: "raypx",
            devEngines: {
              packageManager: { name: "bun", version: "1.4.0" },
              ...(runtime ? { runtime } : {}),
            },
          }),
        ),
      });
      const report = await runDoctor(deps);
      expect(report.checks).toContainEqual(
        expect.objectContaining({ name: "repository", status: "error" }),
      );
      expect(deps.probe).not.toHaveBeenCalledWith(["node", "--version"]);
    }
  });
});
