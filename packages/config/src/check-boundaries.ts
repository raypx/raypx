import { readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  declaredDependencies,
  exportEntries,
  workspacePackages,
  workspaceRoot,
  type PackageManifest,
  type PackageEntry,
} from "./workspace.ts";
import { serverOnlySpecifierPatterns } from "./vite.ts";

export const allowedPackageDependencies: Record<string, string[]> = {
  contracts: [],
  client: ["contracts"],
  ui: [],
  api: ["contracts", "ai", "auth", "db", "storage", "env", "logger"],
  ai: ["env", "logger"],
  db: ["env", "logger"],
  storage: ["env", "logger"],
  auth: ["contracts", "db", "env", "logger"],
  env: [],
  logger: [],
  worker: ["logger"],
  config: [],
  tsconfig: [],
};

const browserPackages = new Set(["contracts", "client", "ui"]);
const engineeringPackages = new Set(["@raypx/config", "@raypx/tsconfig"]);
const reactSpecifier = /^(?:react(?:\/|$)|react-dom(?:\/|$)|@tanstack\/react-query(?:\/|$))/;
const startSpecifier = /^@tanstack\/(?:react-start|start)(?:-|\/|$)/;
const nodeBuiltins = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;
const slash = (path: string) => path.replaceAll("\\", "/");
const shortName = (name: string) => name.replace(/^@raypx\//, "");
const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  "storybook-static",
  "coverage",
  ".output",
  ".tanstack",
  ".git",
]);

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name))
      files.push(...sourceFiles(path));
    else if (
      entry.isFile() &&
      /\.[cm]?[jt]sx?$/.test(entry.name) &&
      entry.name !== "routeTree.gen.ts"
    )
      files.push(path);
  }
  return files;
}

function inside(path: string, directory: string): boolean {
  return path === directory || path.startsWith(`${directory}${sep}`);
}

interface ModuleSpecifier {
  specifier: string;
  node: ts.Node;
}

function moduleSpecifiers(source: ts.SourceFile): ModuleSpecifier[] {
  const specifiers: ModuleSpecifier[] = [];
  function collect(node: ts.Node): void {
    let literal: ts.Node | undefined;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      literal = node.moduleSpecifier;
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      literal = node.moduleReference.expression;
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    )
      literal = node.arguments[0];
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      literal = node.argument.literal;
    if (literal && (ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal))) {
      specifiers.push({ specifier: literal.text, node: literal });
    }
    ts.forEachChild(node, collect);
  }
  collect(source);
  return specifiers;
}

function publicExport(manifest: PackageManifest, specifier: string, name: string): boolean {
  const subpath = specifier === name ? "." : `./${specifier.slice(name.length + 1)}`;
  return exportEntries(manifest).some(([exportPath]) => {
    if (!exportPath.includes("*")) return exportPath === subpath;
    const [prefix = "", suffix] = exportPath.split("*");
    return subpath.startsWith(prefix) && subpath.endsWith(suffix ?? "");
  });
}

function serverModuleAllowed(owner: PackageEntry, file: string): boolean {
  const path = slash(relative(owner.directory, file));
  return (
    /\.server\.[cm]?[jt]sx?$/.test(path) ||
    /^src\/routes\/api(?:[./]|\$)/.test(path) ||
    /(?:^|\/)(?:test|__tests__)\//.test(path) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) ||
    !path.startsWith("src/")
  );
}

export interface BoundaryViolation {
  file: string;
  line: number;
  message: string;
}

export function checkBoundaries(root = workspaceRoot(process.cwd())): BoundaryViolation[] {
  root = resolve(root);
  const packages = workspacePackages(root);
  const owners = [...packages.values()].sort(
    (left, right) => right.directory.length - left.directory.length,
  );
  const violations: BoundaryViolation[] = [];
  const graph = new Map<string, string[]>();
  function report(file: string, message: string, line = 1): void {
    violations.push({ file: slash(relative(root, file)), line, message });
  }
  for (const [name, owner] of packages) {
    const packagePath = slash(relative(root, owner.directory));
    const isPackage = packagePath.startsWith("packages/");
    const dependencies = declaredDependencies(owner.manifest);
    const graphDependencies: string[] = [];
    for (const field of dependencyFields) {
      for (const dependency of Object.keys(owner.manifest[field] ?? {})) {
        if (name === "@raypx/client" && startSpecifier.test(dependency)) {
          report(
            join(owner.directory, "package.json"),
            `${name} must remain framework-independent: ${dependency} belongs in the app`,
          );
        }
        if (!packages.has(dependency)) continue;
        if (!graphDependencies.includes(dependency)) graphDependencies.push(dependency);
        const target = packages.get(dependency)!;
        if (isPackage && slash(relative(root, target.directory)).startsWith("apps/")) {
          report(
            join(owner.directory, "package.json"),
            `${name} must not depend on app ${dependency}`,
          );
        } else if (
          isPackage &&
          !(
            engineeringPackages.has(dependency) &&
            field === "devDependencies" &&
            name !== "@raypx/tsconfig"
          ) &&
          !allowedPackageDependencies[shortName(name)]?.includes(shortName(dependency))
        ) {
          report(
            join(owner.directory, "package.json"),
            `${name} cannot declare ${dependency} in ${field}`,
          );
        }
      }
    }
    graph.set(name, graphDependencies);
    for (const file of sourceFiles(owner.directory)) {
      const content = readFileSync(file, "utf8");
      const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
      const sourcePath = slash(relative(owner.directory, file));
      const isTestModule =
        /(?:^|\/)(?:test|__tests__)\//.test(sourcePath) ||
        /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(sourcePath);
      const isClientRuntime =
        name === "@raypx/client" && sourcePath.startsWith("src/") && !isTestModule;
      const isClientCore = isClientRuntime && !sourcePath.startsWith("src/react/");
      if (isClientCore) {
        let jsx: ts.Node | undefined;
        function findJsx(node: ts.Node): void {
          if (jsx) return;
          if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
            jsx = node;
          } else ts.forEachChild(node, findJsx);
        }
        findJsx(source);
        if (jsx) {
          report(
            file,
            "JSX implicitly imports React and is forbidden in the client core",
            source.getLineAndCharacterOfPosition(jsx.getStart(source)).line + 1,
          );
        }
      }
      for (const { specifier: rawSpecifier, node } of moduleSpecifiers(source)) {
        const specifier = rawSpecifier.replace(/[?#].*$/, "");
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const isBrowserModule =
          (browserPackages.has(shortName(name)) &&
            sourcePath.startsWith("src/") &&
            !isTestModule) ||
          (name === "@raypx/web" && !serverModuleAllowed(owner, file));
        if (isClientRuntime && startSpecifier.test(specifier)) {
          report(
            file,
            `Start import ${specifier} belongs in the app, not the client package`,
            line,
          );
        }
        if (isClientCore && reactSpecifier.test(specifier)) {
          report(file, `React import ${specifier} is forbidden in the client core`, line);
        }
        if (isClientCore && /^@raypx\/client\/react(?:\/|$)/.test(specifier)) {
          report(file, "Client core must not import or reexport its React adapter", line);
        }
        if (isBrowserModule && (specifier.startsWith("node:") || nodeBuiltins.has(specifier))) {
          report(file, `Node.js builtin ${specifier} is forbidden in browser code`, line);
        }
        if (isBrowserModule && (specifier === "bun" || specifier.startsWith("bun:"))) {
          report(file, `Bun builtin ${specifier} is forbidden in browser code`, line);
        }
        if (specifier.startsWith(".") || specifier.startsWith("/")) {
          const targetPath = resolve(dirname(file), specifier);
          if (isClientCore && inside(targetPath, join(owner.directory, "src/react"))) {
            report(file, "Client core must not import or reexport its React adapter", line);
          }
          const targetOwner = owners.find((candidate) => inside(targetPath, candidate.directory));
          if (targetOwner && targetOwner !== owner) {
            report(
              file,
              `Cross-package path ${specifier}: use ${targetOwner.manifest.name} public exports`,
              line,
            );
          }
          if (
            /\.server(?:\.|$)/.test(specifier) &&
            (browserPackages.has(shortName(name)) ||
              (name === "@raypx/web" && !serverModuleAllowed(owner, file)))
          ) {
            report(file, `Server-only import ${specifier} is forbidden in browser code`, line);
          }
          continue;
        }
        if (!specifier.startsWith("@raypx/")) continue;
        const nameMatch = specifier.match(/^(@raypx\/[^/]+)/);
        const targetName = nameMatch?.[1];
        const target = targetName ? packages.get(targetName) : undefined;
        if (!target || !targetName) {
          report(file, `Unknown workspace package ${targetName}`, line);
          continue;
        }
        if (targetName !== name && !(targetName in dependencies)) {
          report(file, `${name} imports undeclared workspace dependency ${targetName}`, line);
        }
        if (engineeringPackages.has(targetName) && sourcePath.startsWith("src/") && !isTestModule) {
          report(file, "Engineering configuration must not be imported by runtime source", line);
        }
        if (/(?:^|\/)(?:src|dist)(?:\/|$)/.test(specifier.slice(targetName.length))) {
          report(file, `Internal package path ${specifier}: use public exports`, line);
        } else if (!publicExport(target.manifest, specifier, targetName)) {
          report(file, `${specifier} is not a public package export`, line);
        }
        if (isPackage && targetName !== name) {
          const developmentConfig =
            engineeringPackages.has(targetName) &&
            name !== "@raypx/tsconfig" &&
            targetName in (owner.manifest.devDependencies ?? {});
          if (
            !developmentConfig &&
            !allowedPackageDependencies[shortName(name)]?.includes(shortName(targetName))
          ) {
            report(file, `${name} cannot import ${targetName}`, line);
          }
        }
        const serverOnly = serverOnlySpecifierPatterns.some((pattern) => pattern.test(specifier));
        if (
          serverOnly &&
          (browserPackages.has(shortName(name)) ||
            (name === "@raypx/web" && !serverModuleAllowed(owner, file)))
        ) {
          report(file, `Server-only import ${specifier} is forbidden in browser code`, line);
        }
      }
    }
  }
  const complete = new Set<string>();
  const active: string[] = [];
  function visit(name: string): void {
    const cycleIndex = active.indexOf(name);
    if (cycleIndex !== -1) {
      const cycle = [...active.slice(cycleIndex), name];
      report(
        join(packages.get(name)!.directory, "package.json"),
        `Workspace dependency cycle: ${cycle.join(" -> ")}`,
      );
      return;
    }
    if (complete.has(name)) return;
    active.push(name);
    for (const dependency of graph.get(name) ?? []) visit(dependency);
    active.pop();
    complete.add(name);
  }
  for (const name of graph.keys()) visit(name);
  return violations;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? resolve(process.argv[2]) : workspaceRoot(process.cwd());
  const violations = checkBoundaries(root);
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line} ${violation.message}`);
  }
  if (violations.length > 0) process.exitCode = 1;
  else console.log("Workspace package boundaries passed.");
}
