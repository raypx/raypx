import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { checkDevelopmentEnvironment } from "../src/environment.ts";

const directories: string[] = [];
const actual = {
  nodeVersion: "22.22.1",
  bunVersion: "1.4.0",
  packageManagerName: "bun",
  packageManagerVersion: "1.4.0",
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "raypx-development-environment-"));
  directories.push(root);
  const manifest = {
    devEngines: {
      runtime: { name: "node", version: "^22.22.1", onFail: "error" },
      packageManager: { name: "bun", version: "1.4.0", onFail: "error" },
    },
    packageManager: "bun@1.4.0",
    engines: { bun: "1.4.0" },
  };
  const writeManifest = () => writeFile(join(root, "package.json"), JSON.stringify(manifest));
  await writeManifest();
  await writeFile(join(root, ".node-version"), "22.22.1\n");
  await writeFile(join(root, ".bun-version"), "1.4.0\n");
  return { root, manifest, writeManifest };
}

test.each(["22.22.1", "22.22.2", "22.23.3", "22.100.0", "v22.22.1", "v22.23.3"])(
  "accepts stable Node %s at or above the baseline within the same major",
  async (nodeVersion) => {
    const { root } = await fixture();
    expect(checkDevelopmentEnvironment(root, { ...actual, nodeVersion })).toEqual([]);
  },
);

test.each([
  "22.21.1",
  "22.22.0",
  "20.19.0",
  "23.0.0",
  "24.11.0",
  "22.23.3-rc.1",
  "22.23.3+build.1",
  "v22.23.3-rc.1",
  "22.23",
  "invalid",
  "",
  "unavailable (install Node.js and add it to PATH)",
])("rejects Node %j outside the supported stable range", async (nodeVersion) => {
  const { root } = await fixture();
  expect(checkDevelopmentEnvironment(root, { ...actual, nodeVersion })).toEqual(
    expect.arrayContaining([expect.stringMatching(/node/i), expect.stringContaining("22.22.1")]),
  );
});

test.each([
  "22.22.1",
  "~22.22.1",
  ">=22.22.1",
  "^22",
  "^22.22",
  "^22.22.1-rc.1",
  "^22.22.1+build.1",
  "^22.22.1 || ^24.0.0",
  "invalid",
  "",
])("rejects malformed Node runtime declaration %j", async (version) => {
  const { root, manifest, writeManifest } = await fixture();
  manifest.devEngines.runtime.version = version;
  await writeManifest();
  expect(checkDevelopmentEnvironment(root, actual)).toEqual(
    expect.arrayContaining([expect.stringContaining("devEngines.runtime")]),
  );
});

test.each([
  { name: "bun", version: "^22.22.1", onFail: "error" },
  { name: "node", version: "^22.22.1", onFail: "warn" },
  { name: "node", version: 22, onFail: "error" },
  { name: "node", onFail: "error" },
  null,
])("rejects invalid Node runtime declaration %j", async (runtime) => {
  const { root, manifest } = await fixture();
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ ...manifest, devEngines: { ...manifest.devEngines, runtime } }),
  );
  expect(checkDevelopmentEnvironment(root, actual)).toEqual(
    expect.arrayContaining([expect.stringContaining("devEngines.runtime")]),
  );
});

test.each(["^22.22.2", "^22.23.0"])(
  "requires Node runtime declaration %s to match the pinned baseline exactly",
  async (version) => {
    const { root, manifest, writeManifest } = await fixture();
    manifest.devEngines.runtime.version = version;
    await writeManifest();
    expect(checkDevelopmentEnvironment(root, { ...actual, nodeVersion: "22.23.3" })).toEqual(
      expect.arrayContaining([expect.stringContaining(".node-version")]),
    );
  },
);

test("reports the actual and required Node version", async () => {
  const { root } = await fixture();
  const errors = checkDevelopmentEnvironment(root, { ...actual, nodeVersion: "22.21.1" });
  expect(errors).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/node/i),
      expect.stringContaining("22.21.1"),
      expect.stringContaining("22.22.1"),
    ]),
  );
});

test.each(["1.3.0", "1.4.1", "1.5.0"])(
  "requires the exact Bun version instead of %s",
  async (bunVersion) => {
    const { root } = await fixture();
    const errors = checkDevelopmentEnvironment(root, { ...actual, bunVersion });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/bun/i),
        expect.stringContaining("1.4.0"),
        expect.stringContaining(bunVersion),
      ]),
    );
  },
);

test("rejects a different package manager or package manager version", async () => {
  const { root } = await fixture();
  const wrongManager = checkDevelopmentEnvironment(root, {
    ...actual,
    packageManagerName: "pnpm",
    packageManagerVersion: "9.15.9",
  });
  expect(wrongManager).toEqual(expect.arrayContaining([expect.stringContaining("pnpm")]));
  const wrongVersion = checkDevelopmentEnvironment(root, {
    ...actual,
    packageManagerVersion: "1.3.0",
  });
  expect(wrongVersion).toEqual(
    expect.arrayContaining([expect.stringContaining("1.4.0"), expect.stringContaining("1.3.0")]),
  );
});

test("reports drift between devEngines and the other version declarations", async () => {
  const { root, manifest, writeManifest } = await fixture();
  manifest.packageManager = "bun@1.3.0";
  manifest.engines.bun = "1.3.0";
  await writeManifest();
  expect(checkDevelopmentEnvironment(root, actual)).toEqual(
    expect.arrayContaining([
      expect.stringContaining("packageManager"),
      expect.stringContaining("engines.bun"),
    ]),
  );
  const { root: driftedPins } = await fixture();
  await writeFile(join(driftedPins, ".node-version"), "24.11.0\n");
  await writeFile(join(driftedPins, ".bun-version"), "1.3.0\n");
  expect(checkDevelopmentEnvironment(driftedPins, actual)).toEqual(
    expect.arrayContaining([
      expect.stringContaining(".node-version"),
      expect.stringContaining(".bun-version"),
    ]),
  );
});

test("reports missing development declarations without throwing", async () => {
  const { root } = await fixture();
  await writeFile(join(root, "package.json"), "{}");
  expect(checkDevelopmentEnvironment(root, actual)).toEqual(
    expect.arrayContaining([
      expect.stringContaining("devEngines.runtime"),
      expect.stringContaining("devEngines.packageManager"),
      expect.stringContaining("packageManager"),
      expect.stringContaining("engines.bun"),
    ]),
  );
});

test("reports missing manifest and version files without throwing", async () => {
  const { root } = await fixture();
  await rm(join(root, "package.json"));
  expect(checkDevelopmentEnvironment(root, actual)).toEqual(
    expect.arrayContaining([expect.stringContaining("package.json")]),
  );
  const { root: missingVersions } = await fixture();
  await Promise.all(
    [".node-version", ".bun-version"].map((name) => rm(join(missingVersions, name))),
  );
  expect(checkDevelopmentEnvironment(missingVersions, actual)).toEqual(
    expect.arrayContaining([
      expect.stringContaining(".node-version"),
      expect.stringContaining(".bun-version"),
    ]),
  );
});

test("checks the actual Bun runtime when package manager metadata is absent", async () => {
  const { root } = await fixture();
  const direct = { nodeVersion: actual.nodeVersion, bunVersion: actual.bunVersion };
  expect(checkDevelopmentEnvironment(root, direct)).toEqual([]);
  expect(checkDevelopmentEnvironment(root, { ...direct, bunVersion: "1.3.0" })).toEqual(
    expect.arrayContaining([expect.stringContaining("1.3.0")]),
  );
});
