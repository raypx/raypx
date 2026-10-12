import { expectOnlyFinding } from "../test-fixtures.js";
import { describe, expect, it } from "vite-plus/test";

import {
  canonicalScripts,
  deriveWorkspaceShape,
  fixWorkspaceManifest,
  validateWorkspaceManifest,
  type WorkspaceShape,
} from "./manifests.js";
import { validateTestWiring } from "./manifests/wiring.js";

const location = "packages/example/package.json";

const checkCommand = "tsc --noEmit -p tsconfig.json";

function shape(overrides: Partial<WorkspaceShape> = {}): WorkspaceShape {
  return {
    hasVitestConfig: true,
    hasTestFiles: true,
    typeScriptConfigs: ["tsconfig.json"],
    ...overrides,
  };
}

const defaultScripts = { ...canonicalScripts, check: checkCommand, build: checkCommand };
function manifest(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    name: "@voidmix/example",
    private: true,
    scripts: defaultScripts,
    ...overrides,
  });
}

describe("deriveWorkspaceShape", () => {
  it("reads the runner, the tests, and every root TypeScript project", () => {
    expect(
      deriveWorkspaceShape("apps/desktop", [
        "apps/desktop/package.json",
        "apps/desktop/tsconfig.json",
        "apps/desktop/tsconfig.node.json",
        "apps/desktop/vitest.config.ts",
        "apps/desktop/src/app.test.ts",
        "apps/web/tsconfig.json",
      ]),
    ).toEqual({
      hasVitestConfig: true,
      hasTestFiles: true,
      typeScriptConfigs: ["tsconfig.json", "tsconfig.node.json"],
    });
  });

  it("ignores a nested config, which belongs to a fixture rather than the workspace", () => {
    expect(
      deriveWorkspaceShape("packages/db", [
        "packages/db/package.json",
        "packages/db/src/vitest.config.ts",
        "packages/db/src/fixtures/tsconfig.json",
      ]),
    ).toEqual({ hasVitestConfig: false, hasTestFiles: false, typeScriptConfigs: [] });
  });
});

describe("validateWorkspaceManifest", () => {
  it("accepts a manifest that matches the contract", () => {
    expect(validate(manifest())).toEqual([]);
  });

  for (const name of Object.keys(canonicalScripts)) {
    it(`reports ${name} when it deviates, quoting the command to paste`, () => {
      const scripts: Record<string, string> = { ...defaultScripts };
      scripts[name] = "vp test --run --silent";
      const findings = validate(manifest({ scripts }));

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        check: "manifest.scripts",
        location,
        message: `${name} does not match the repository-wide command`,
        severity: "error",
      });
      expect(findings[0]?.fix).toContain(canonicalScripts[name] ?? "");
    });
  }

  it("reports a canonical script the workspace never declares", () => {
    const { "test:component": _omitted, ...rest } = canonicalScripts;
    const findings = validate(
      manifest({ scripts: { ...rest, check: checkCommand, build: checkCommand } }),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("does not declare test:component");
  });

  it("reports test scripts declared without a runner to run them", () => {
    const findings = validate(
      manifest({ scripts: { ...canonicalScripts, check: checkCommand } }),
      shape({ hasVitestConfig: false }),
    );

    expect(findings).toHaveLength(Object.keys(canonicalScripts).length);
    expect(findings[0]).toMatchObject({ check: "manifest.scripts" });
    expect(findings[0]?.message).toContain("without a vitest.config.ts");
  });

  it("expects no test scripts when the workspace owns no runner", () => {
    expect(
      validate(manifest({ scripts: { check: checkCommand } }), shape({ hasVitestConfig: false })),
    ).toEqual([]);
  });

  it.each([
    {
      name: "reports a TypeScript project that check never reaches",
      content: manifest(),
      shape: shape({ typeScriptConfigs: ["tsconfig.json", "tsconfig.node.json"] }),
      expected: {
        message: expect.stringContaining("check does not type-check tsconfig.node.json"),
      },
    },
    {
      name: "reports a build that repeats the task graph check",
      content: manifest({
        scripts: { ...canonicalScripts, check: checkCommand, build: "bun run check && vp build" },
      }),
      shape: shape(),
      expected: {
        message: expect.stringContaining("build repeats the check"),
        fix: expect.stringContaining("remove the bun run check prefix"),
      },
    },
    {
      name: "reports a workspace that owns a project but declares no check",
      content: manifest({ scripts: { ...canonicalScripts } }),
      shape: shape(),
      expected: { message: expect.stringContaining("declares no check script") },
    },
    {
      name: "reports a third-party dependency pinned outside the catalog",
      content: manifest({ dependencies: { zod: "4.4.3" } }),
      shape: shape(),
      expected: {
        check: "manifest.dependencies",
        location,
        message: expect.stringContaining("dependencies pins zod to 4.4.3"),
      },
    },
    {
      name: "reports an internal dependency that bypasses the workspace protocol",
      content: manifest({ devDependencies: { "@voidmix/tsconfig": "^0.0.0" } }),
      shape: shape(),
      expected: {
        message: expect.stringContaining("devDependencies pins @voidmix/tsconfig"),
        fix: expect.stringContaining("workspace:*"),
      },
    },
    {
      name: "reports a workspace that restates the root toolchain",
      content: manifest({ devEngines: { packageManager: { name: "bun" } } }),
      shape: shape(),
      expected: { check: "manifest.engines", message: "declares its own devEngines" },
    },
    {
      name: "reports malformed JSON once rather than throwing past the other rules",
      content: "{ not json",
      shape: shape(),
      expected: { message: "is not valid JSON", fix: expect.stringContaining("without comments") },
    },
  ])("$name", ({ content, shape, expected }) => {
    expectOnlyFinding(validate(content, shape), expected);
  });

  it("follows bun run references, so a composed check counts as covering both", () => {
    const scripts = {
      ...canonicalScripts,
      check: "bun run typecheck && bun run typecheck:node",
      typecheck: checkCommand,
      "typecheck:node": "tsc --noEmit -p tsconfig.node.json",
      build: "vmx env -- vp build",
    };

    expect(
      validate(
        manifest({ scripts }),
        shape({ typeScriptConfigs: ["tsconfig.json", "tsconfig.node.json"] }),
      ),
    ).toEqual([]);
  });

  for (const value of [42, ["catalog:"], null]) {
    it(`reports a non-string dependency value (${String(value)}) without throwing`, () => {
      const findings = validate(manifest({ dependencies: { zod: value } }));

      expect(findings).toEqual([
        {
          check: "manifest.structure",
          location,
          message: "dependencies must be an object whose values are strings",
          fix: `repair dependencies in ${location}; use an object with string values`,
          severity: "error",
        },
      ]);
    });
  }

  it("reports an invalid scripts field without throwing", () => {
    const content = manifest({ scripts: ["vp test --run"] });

    expect(validate(content)).toEqual([
      {
        check: "manifest.structure",
        location,
        message: "scripts must be an object whose values are strings",
        fix: `repair scripts in ${location}; use an object with string values`,
        severity: "error",
      },
    ]);
  });

  it("leaves peerDependencies alone, where a range is the point", () => {
    expect(validate(manifest({ peerDependencies: { react: "^19.2.0" } }))).toEqual([]);
  });
});

describe("fixWorkspaceManifest", () => {
  // The fixture is compact rather than 2-space indented on purpose: a manifest
  // with no finding against it must come back untouched whatever its formatting,
  // because reformatting is Oxfmt's job and not this command's.
  it("returns a conforming manifest byte-identical, whatever its formatting", () => {
    const content = manifest();

    expect(fix(content)).toBe(content);
  });

  it("rewrites every deviating script, adds a missing one, and drops devEngines", () => {
    const { "test:component": _omitted, ...rest } = canonicalScripts;
    const content = manifest({
      devEngines: { runtime: { name: "node" } },
      scripts: { ...rest, "test:unit": "vp test --run", check: checkCommand, build: checkCommand },
    });

    const fixed = fix(content);

    expect(validate(fixed)).toEqual([]);
    expect(JSON.parse(fixed)).toMatchObject({ scripts: canonicalScripts });
    expect(fixed).not.toContain("devEngines");
  });

  it("removes a check prefix already owned by the task graph", () => {
    const scripts = {
      ...canonicalScripts,
      check: checkCommand,
      build: "bun run check && vp build",
    };
    const fixed = fix(manifest({ scripts }));

    expect(JSON.parse(fixed).scripts.build).toBe("vp build");
    expect(validate(fixed)).toEqual([]);
  });

  it("leaves a dependency alone, because which catalog it belongs in is a decision", () => {
    const content = manifest({ dependencies: { zod: "4.4.3" } });

    expect(fix(content)).toBe(content);
  });

  it("leaves a stray test script alone when the runner is what may be missing", () => {
    const content = manifest({ scripts: { ...canonicalScripts, check: checkCommand } });

    expect(fix(content, shape({ hasVitestConfig: false }))).toBe(content);
  });

  it("creates canonical scripts when a vitest workspace has no scripts field", () => {
    const content = manifest({ scripts: undefined });
    const fixed = fix(content, shape({ typeScriptConfigs: [] }));

    expect(JSON.parse(fixed).scripts).toEqual(canonicalScripts);
    expect(validate(fixed, shape({ typeScriptConfigs: [] }))).toEqual([]);
    expect(fix(fixed, shape({ typeScriptConfigs: [] }))).toBe(fixed);
  });

  it("leaves an invalid scripts field untouched", () => {
    const content = manifest({
      scripts: ["vp test --run"],
      devEngines: { runtime: { name: "node" } },
    });
    const fixed = fix(content);

    expect(JSON.parse(fixed).scripts).toEqual(["vp test --run"]);
    expect(JSON.parse(fixed)).not.toHaveProperty("devEngines");
    expect(validate(fixed)).toEqual([
      expect.objectContaining({
        check: "manifest.structure",
        message: "scripts must be an object whose values are strings",
      }),
    ]);
  });

  it("leaves malformed JSON untouched rather than guessing at it", () => {
    expect(fix("{ not json")).toBe("{ not json");
  });

  it("is idempotent", () => {
    const scripts = { ...canonicalScripts, "test:unit": "vp test --run", check: checkCommand };
    const once = fix(manifest({ scripts }));

    expect(fix(once)).toBe(once);
  });
});

describe("validateTestWiring", () => {
  const config = "apps/web/vitest.config.ts";

  it("warns when a runner is configured and no test exists", () => {
    const findings = validateTestWiring(config, shape({ hasTestFiles: false }));

    expectOnlyFinding(findings, {
      check: "tests.wiring",
      location: config,
      severity: "warn",
    });
    expect(findings[0]?.fix).toContain("apps/web/src");
  });

  it("stays quiet when tests exist", () => {
    expect(validateTestWiring(config, shape())).toEqual([]);
  });

  it("stays quiet when the workspace owns no runner", () => {
    expect(
      validateTestWiring(config, shape({ hasVitestConfig: false, hasTestFiles: false })),
    ).toEqual([]);
  });
});

function validate(content: string, workspace = shape()) {
  return validateWorkspaceManifest(location, content, workspace);
}
function fix(content: string, workspace = shape()) {
  return fixWorkspaceManifest(content, workspace);
}
