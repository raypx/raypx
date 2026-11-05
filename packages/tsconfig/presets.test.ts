import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";

interface Preset {
  extends?: string;
  compilerOptions?: Record<string, unknown>;
  [field: string]: unknown;
}

const packageRoot = new URL(".", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8")) as {
  exports: Record<string, string>;
  files: string[];
};
const presetNames = Object.keys(manifest.exports).map((key) => key.slice(2, -".json".length));

async function readPreset(name: string): Promise<Preset> {
  return JSON.parse(await readFile(new URL(`${name}.json`, packageRoot), "utf8")) as Preset;
}

/** Nearer compiler options win, matching TypeScript's single-parent extends. */
async function resolvePreset(name: string, seen: string[] = []): Promise<Record<string, unknown>> {
  if (seen.includes(name)) throw new Error(`Preset cycle: ${[...seen, name].join(" -> ")}`);
  const preset = await readPreset(name);
  const parent = preset.extends;
  const inherited =
    parent === undefined
      ? {}
      : await resolvePreset(parent.replace(/^\.\//, "").replace(/\.json$/, ""), [...seen, name]);
  return { ...inherited, ...preset.compilerOptions };
}

describe("TypeScript presets", () => {
  it("publishes every exported preset and nothing that is not exported", () => {
    expect(presetNames).toEqual(["base", "browser", "node", "library", "react-library"]);
    for (const [key, target] of Object.entries(manifest.exports)) expect(target).toBe(key);
    expect(manifest.files.filter((file) => file.endsWith(".json")).sort()).toEqual(
      presetNames.map((name) => `${name}.json`).sort(),
    );
  });

  it("keeps the base preset independent", async () => {
    expect((await readPreset("base")).extends).toBeUndefined();
  });

  it.each(presetNames.filter((name) => name !== "base"))(
    "extends a sibling preset from %s",
    async (name) => {
      expect((await readPreset(name)).extends).toMatch(/^\.\/[a-z-]+\.json$/);
    },
  );

  it.each(presetNames)("resolves %s to the base compiler options", async (name) => {
    await expect(resolvePreset(name)).resolves.toMatchObject({ target: "ES2022" });
  });

  it.each(presetNames)("keeps strict compiler guarantees in %s", async (name) => {
    expect(await resolvePreset(name)).toMatchObject({
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      noImplicitOverride: true,
      useUnknownInCatchVariables: true,
      noFallthroughCasesInSwitch: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noUncheckedSideEffectImports: true,
      forceConsistentCasingInFileNames: true,
      isolatedModules: true,
      verbatimModuleSyntax: true,
      noEmit: true,
      skipLibCheck: true,
    });
  });

  it.each(presetNames)("leaves project layout and runtime types to %s consumers", async (name) => {
    const preset = await readPreset(name);
    for (const field of ["include", "exclude", "files", "references"])
      expect(preset).not.toHaveProperty(field);
    for (const option of ["paths", "baseUrl", "rootDir", "outDir", "declarationDir"])
      expect(preset.compilerOptions ?? {}).not.toHaveProperty(option);
    const types = (await resolvePreset(name)).types as string[];
    expect(types.filter((type) => /bun/.test(type))).toEqual([]);
  });

  it("targets each runtime with its own module resolution and libraries", async () => {
    expect(await resolvePreset("node")).toMatchObject({
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["ESNext"],
      types: ["node"],
    });
    expect(await resolvePreset("browser")).toMatchObject({
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      types: [],
    });
    expect(await resolvePreset("library")).toMatchObject({
      module: "ESNext",
      moduleResolution: "Bundler",
      lib: ["ES2022"],
      types: [],
    });
    expect(await resolvePreset("react-library")).toMatchObject({
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
    });
    expect(await resolvePreset("library")).not.toHaveProperty("jsx");
  });
});
