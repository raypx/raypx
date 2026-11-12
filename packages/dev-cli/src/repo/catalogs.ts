import { readFileSync } from "node:fs";
import { parseSync } from "oxc-parser";

/** A message catalog: nested objects whose leaves are strings. */
export interface CatalogTree {
  readonly [key: string]: string | CatalogTree;
}

/**
 * Reads a `.json` catalog or the static default export of a TS/JS module without
 * executing it. Only object literals with string values, `as const` and `satisfies`
 * are accepted; anything computed is rejected.
 */
export function readStaticCatalog(path: string, source = readFileSync(path, "utf8")): CatalogTree {
  const object = (): Record<string, string | CatalogTree> => Object.create(null);
  function readNode(value: unknown): string | CatalogTree {
    if (!value || typeof value !== "object")
      throw new Error(`${path}: catalogs must contain static string objects`);
    const node = value as Record<string, unknown>;
    if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression")
      return readNode(node.expression);
    if (node.type === "Literal" && typeof node.value === "string") return node.value;
    if (node.type !== "ObjectExpression")
      throw new Error(`${path}: catalogs must contain static string objects`);
    const result = object();
    for (const property of node.properties as Record<string, unknown>[]) {
      if (property.type !== "Property" || property.computed)
        throw new Error(`${path}: dynamic catalog keys are unsupported`);
      const key = property.key as { value?: unknown; name?: string };
      const name = typeof key.value === "string" ? key.value : key.name;
      if (!name) throw new Error(`${path}: invalid catalog key`);
      result[name] = readNode(property.value);
    }
    return result;
  }
  function readJson(value: unknown): string | CatalogTree {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`${path}: expected static string objects`);
    const result = object();
    for (const [key, child] of Object.entries(value)) result[key] = readJson(child);
    return result;
  }
  let result: string | CatalogTree;
  if (path.endsWith(".json")) result = readJson(JSON.parse(source));
  else {
    const parsed = parseSync(path, source);
    if (parsed.errors.length) throw new Error(`${path}: ${parsed.errors[0]!.message}`);
    const declaration = parsed.program.body.find(
      (node) => node.type === "ExportDefaultDeclaration",
    );
    if (!declaration || declaration.type !== "ExportDefaultDeclaration")
      throw new Error(`${path}: expected a default static catalog`);
    result = readNode(declaration.declaration);
  }
  if (typeof result === "string") throw new Error(`${path}: expected a catalog object`);
  return result;
}
