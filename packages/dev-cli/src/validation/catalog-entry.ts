import { posix } from "node:path";
import { parseSync } from "oxc-parser";

/** Verify namespace registration without importing or evaluating a language entry. */
export function checkCatalogEntry(
  path: string,
  source: string,
  catalogs: readonly string[],
  shared: ReadonlyMap<string, readonly string[]> = new Map(),
): string[] {
  const parsed = parseSync(path, source);
  if (parsed.errors.length) return [`${path}: invalid catalog entry`];
  const imports = new Map<string, string>();
  for (const statement of parsed.program.body) {
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue;
    for (const specifier of statement.specifiers)
      if (specifier.type === "ImportDefaultSpecifier")
        imports.set(specifier.local.name, statement.source.value);
  }
  const declaration = parsed.program.body.find((node) => node.type === "ExportDefaultDeclaration");
  let value = declaration?.declaration;
  while (value?.type === "TSAsExpression" || value?.type === "TSSatisfiesExpression")
    value = value.expression;
  if (value?.type !== "ObjectExpression")
    return [`${path}: expected a default object assembling static catalog imports`];
  const owned = new Set(catalogs.map((catalog) => posix.basename(catalog, posix.extname(catalog))));
  const assembled = new Map<string, string>();
  const findings: string[] = [];
  function register(namespace: string, specifier: string) {
    if (assembled.has(namespace))
      findings.push(`${path}: namespace ${namespace} is assembled more than once`);
    assembled.set(namespace, specifier);
  }
  for (const property of value.properties) {
    if (property.type === "SpreadElement") {
      const specifier =
        property.argument.type === "Identifier" ? imports.get(property.argument.name) : undefined;
      const namespaces = specifier ? shared.get(specifier) : undefined;
      if (!specifier || !namespaces)
        return [`${path}: spreads must use same-language public catalog entries`];
      for (const namespace of namespaces) register(namespace, specifier);
      continue;
    } else if (!property.computed && property.value.type === "Identifier") {
      let name: unknown;
      if (property.key.type === "Identifier") name = property.key.name;
      if (property.key.type === "Literal") name = property.key.value;
      const specifier = imports.get(property.value.name);
      if (typeof name === "string" && specifier) {
        if (!owned.has(name)) findings.push(`${path}: namespace ${name} has no owned catalog`);
        register(name, specifier);
        continue;
      }
    }
    return [`${path}: catalog entries must assemble static imports`];
  }
  for (const catalog of catalogs) {
    const extension = posix.extname(catalog);
    const namespace = posix.basename(catalog, extension);
    const expected = `./${namespace}${extension === ".ts" ? ".js" : ".json"}`;
    if (assembled.get(namespace) !== expected)
      findings.push(`${path}: missing namespace ${namespace} from ${expected}`);
  }
  return findings;
}
