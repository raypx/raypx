import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";

const script = resolve(import.meta.dirname, "../../../../deploy/sources.ts");

function write(root: string, path: string, contents: object | string) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents));
}

it("collects production workspace sources transitively from the Bun catalog layout", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-deploy-sources-"));
  const source = join(directory, "source"),
    output = join(directory, "output");
  try {
    const patterns = ["units/*", "shared/*", "units/migration"];
    write(source, "package.json", {
      private: true,
      workspaces: { packages: patterns, catalog: { registry: "1.0.0" } },
    });
    for (const [path, manifest] of [
      [
        "units/migration",
        {
          name: "migration",
          dependencies: { configuration: "workspace:*", registry: "catalog:" },
          devDependencies: { tooling: "workspace:*" },
        },
      ],
      [
        "units/configuration",
        {
          name: "configuration",
          dependencies: { tokens: "workspace:*" },
          optionalDependencies: { optional: "workspace:*" },
          peerDependencies: { peer: "workspace:*" },
        },
      ],
      ["shared/tokens", { name: "tokens" }],
      ["shared/optional", { name: "optional" }],
      ["shared/peer", { name: "peer" }],
      ["units/tooling", { name: "tooling" }],
      ["units/unrelated", { name: "unrelated" }],
    ] as const) {
      write(source, `${path}/package.json`, manifest);
      write(source, `${path}/src/index.ts`, `export const name = "${manifest.name}";`);
      write(source, `${path}/tests/private.test.ts`, "test-only content");
      write(source, `${path}/.env`, "PRIVATE_VALUE=fixture");
      write(source, `${path}/node_modules/private/index.js`, "unrelated dependency");
    }
    write(source, "shared/tokens/src/data.json", { value: 42 });
    write(source, "units/migration/drizzle-foundation/0000.sql", "fixture migration");

    const result = spawnSync(process.execPath, [script, source, output, "migration"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const expected = [
      "units/migration",
      "units/configuration",
      "shared/tokens",
      "shared/optional",
      "shared/peer",
    ].flatMap((path) => [`${path}/package.json`, `${path}/src/index.ts`]);
    expect([...new Bun.Glob("**/*").scanSync({ cwd: output, onlyFiles: true })].sort()).toEqual(
      [...expected, "shared/tokens/src/data.json"].sort(),
    );
    expect(readFileSync(join(output, "shared/tokens/src/data.json"), "utf8")).toBe('{"value":42}');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("rejects a missing production dependency before copying sources", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-deploy-missing-"));
  const source = join(directory, "source"),
    output = join(directory, "output");
  try {
    write(source, "package.json", { private: true, workspaces: ["modules/*"] });
    write(source, "modules/migration/package.json", {
      name: "migration",
      dependencies: { missing: "workspace:*" },
    });
    const result = spawnSync(process.execPath, [script, source, output, "migration"], {
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unknown production workspace:");
    expect(existsSync(output)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
