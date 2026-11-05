import { discover } from "@raypx-kit/devkit/workspaces";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

interface FileSize {
  path: string;
  bytes: number;
}
interface SizeTotal {
  bytes: number;
  files: number;
}
interface ArtifactSize extends SizeTotal {
  workspace: string;
  path: string;
  kind: "build" | "renderer" | "native";
  status: "measured" | "missing";
  symlinks: number;
  components: ({ name: string } & SizeTotal)[];
}
export interface SizeOptions {
  packages: string[];
  native?: boolean;
  browser?: boolean;
  required?: boolean;
}

const posix = (path: string) => path.replaceAll("\\", "/");

/** Count logical regular-file bytes. Never follow links outside a distributable or into cycles. */
function scan(directory: string) {
  const files: FileSize[] = [];
  let symlinks = 0;
  function visit(path: string) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) symlinks++;
    else if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(join(path, name));
    } else if (stat.isFile())
      files.push({ path: posix(relative(directory, path)), bytes: stat.size });
  }
  if (existsSync(directory)) visit(directory);
  return { files, symlinks };
}

function total(files: FileSize[]): SizeTotal {
  return { bytes: files.reduce((sum, file) => sum + file.bytes, 0), files: files.length };
}

function measure(root: string, workspace: string, path: string, kind: ArtifactSize["kind"]) {
  const absolute = resolve(root, path);
  const { files, symlinks } = scan(absolute);
  const components: ArtifactSize["components"] = [];
  if (existsSync(join(absolute, "runtime.json")) && existsSync(join(absolute, "runtime"))) {
    const groups = new Map<string, FileSize[]>();
    for (const file of files) {
      const name = file.path.startsWith("runtime/pnpm/")
        ? "pnpm / pnpx"
        : file.path.startsWith("runtime/")
          ? "Node"
          : file.path.startsWith("herdr/")
            ? "Herdr"
            : "Application / launcher / metadata";
      const group = groups.get(name) ?? [];
      group.push(file);
      groups.set(name, group);
    }
    for (const [name, group] of groups) components.push({ name, ...total(group) });
  }
  return {
    workspace,
    path: posix(relative(root, absolute)),
    kind,
    status: files.length ? "measured" : "missing",
    ...total(files),
    symlinks,
    components,
  } satisfies ArtifactSize;
}

function nativeBundles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return entry.name.endsWith(".app") ? [path] : nativeBundles(path);
      return entry.isFile() && /\.(?:dmg|exe|msi|tar\.gz|zip|AppImage|deb|rpm)$/.test(entry.name)
        ? [path]
        : [];
    });
}

export function collectBuildSizes(root: string, options: SizeOptions) {
  const index = discover(root, { metadataKey: "raypx" });
  if (index.findings.length) throw new Error(index.findings.join("\n"));
  const buildable = index.workspaces.filter((member) => member.manifest.scripts?.build);
  const selected = new Set(
    options.packages.map((selector) => {
      const matches = buildable.filter(
        (member) =>
          member.manifest.name === selector ||
          member.manifest.name.replace(/^@raypx\//, "") === selector ||
          member.path === selector,
      );
      if (matches.length !== 1) throw new Error(`Unknown or ambiguous build package: ${selector}`);
      return matches[0]!.path;
    }),
  );
  const artifacts: ArtifactSize[] = [];
  for (const member of buildable) {
    if (selected.size && !selected.has(member.path)) continue;
    const workspace = member.manifest.name;
    const tauri = join(root, member.path, "src-tauri/tauri.conf.json");
    if (existsSync(tauri)) {
      const config = JSON.parse(readFileSync(tauri, "utf8")) as {
        build: { frontendDist: string };
      };
      const renderer = options.browser
        ? join(member.path, "artifacts/browser/client")
        : relative(root, resolve(root, member.path, "src-tauri", config.build.frontendDist));
      artifacts.push(measure(root, workspace, renderer, "renderer"));
      if (options.native) {
        const bundle = resolve(root, process.env.CARGO_TARGET_DIR ?? "target", "release/bundle");
        const bundles = nativeBundles(bundle);
        for (const path of bundles) artifacts.push(measure(root, workspace, path, "native"));
        if (!bundles.length)
          artifacts.push({
            workspace,
            path: posix(relative(root, bundle)),
            kind: "native",
            status: "missing",
            bytes: 0,
            files: 0,
            symlinks: 0,
            components: [],
          });
      }
    } else {
      // Nitro's deployable output takes precedence over intermediate Vite dist files.
      const nitro = join(member.path, ".output");
      const output = scan(join(root, nitro)).files.length ? nitro : join(member.path, "dist");
      artifacts.push(measure(root, workspace, output, "build"));
    }
  }
  return {
    version: 1,
    observedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    revision: process.env.GITHUB_SHA ?? null,
    artifacts,
  };
}

const mib = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
const cell = (value: string) => value.replaceAll("|", "\\|").replace(/[\r\n]/g, " ");

function markdown(report: ReturnType<typeof collectBuildSizes>) {
  const rows = report.artifacts.flatMap((artifact) => [
    `| ${cell(artifact.workspace)} | ${artifact.kind} | ${cell(artifact.path)} | ${artifact.status === "missing" ? "Unavailable" : mib(artifact.bytes)} | ${artifact.status === "missing" ? "—" : artifact.files} |`,
    ...artifact.components.map(
      (part) =>
        `| ${cell(artifact.workspace)} | component | ${part.name} | ${mib(part.bytes)} | ${part.files} |`,
    ),
  ]);
  return [
    `### Build sizes (${report.platform}/${report.arch})`,
    "",
    "| Package | Artifact | Path / component | Size | Files |",
    "| --- | --- | --- | ---: | ---: |",
    ...rows,
    "",
    "Directory sizes sum regular-file bytes, including maps/licenses; symlinks are excluded. Installer/archive rows use actual file bytes. Components are included in their parent; artifacts are not additive. Missing outputs are unavailable, not zero. This is a snapshot of existing outputs, not a fresh build or platform acceptance.",
    "",
  ].join("\n");
}

export function reportBuildSizes(root: string, options: SizeOptions) {
  const report = collectBuildSizes(root, options);
  const parent = join(root, ".artifacts/sizes");
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, `${report.observedAt.replaceAll(":", "-")}-`));
  const summary = markdown(report);
  writeFileSync(join(directory, "sizes.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(directory, "sizes.md"), summary);
  console.log(summary);
  console.log(`Build size report: ${posix(relative(root, directory))}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${summary}`);
  if (options.required && report.artifacts.some((artifact) => artifact.status === "missing"))
    throw new Error(
      "Required build size inputs are unavailable; build the selected packages first",
    );
  return report;
}

export function sizeOptions(args: string[]): SizeOptions {
  const options: SizeOptions = { packages: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--native") options.native = true;
    else if (arg === "--browser") options.browser = true;
    else if (arg === "--require") options.required = true;
    else if (arg === "--package" && args[i + 1] && !args[i + 1]!.startsWith("-"))
      options.packages.push(args[++i]!);
    else
      throw new Error(
        "Usage: pnpm run size [--package name|path] [--native] [--browser] [--require]",
      );
  }
  return options;
}
