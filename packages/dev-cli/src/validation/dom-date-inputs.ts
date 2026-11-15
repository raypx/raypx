import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSync, visitorKeys, type Node } from "oxc-parser";
import type { WorkspaceIndex } from "../repo/workspaces.js";

const nativeDateTypes = new Set(["date", "datetime-local", "month", "week", "time"]);

/** Inspect syntax rather than matching comments, fixtures or unrelated type declarations. */
export function nativeDateInputViolations(path: string, source: string): string[] {
  const parsed = parseSync(path, source);
  if (parsed.errors.length) return [`${path}: unable to inspect DOM date controls`];
  const bindings = new Map<string, Node>();
  const nodes: Node[] = [];
  function walk(node: Node) {
    nodes.push(node);
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init)
      bindings.set(node.id.name, node.init);
    const record = node as unknown as Record<string, Node | Node[] | undefined>;
    for (const key of visitorKeys[node.type] ?? []) {
      const child = record[key];
      if (Array.isArray(child))
        child.forEach((item) => {
          if (item) walk(item);
        });
      else if (child) walk(child);
    }
  }
  walk(parsed.program);
  function strings(node: Node | null | undefined, seen = new Set<string>()): string[] {
    if (!node) return [];
    if (node.type === "Literal") return typeof node.value === "string" ? [node.value] : [];
    if (node.type === "JSXExpressionContainer") return strings(node.expression, seen);
    if (
      node.type === "TSAsExpression" ||
      node.type === "TSSatisfiesExpression" ||
      node.type === "ParenthesizedExpression"
    )
      return strings(node.expression, seen);
    if (node.type === "Identifier" && !seen.has(node.name))
      return strings(bindings.get(node.name), new Set([...seen, node.name]));
    if (node.type === "ConditionalExpression")
      return [...strings(node.consequent, seen), ...strings(node.alternate, seen)];
    if (node.type === "LogicalExpression")
      return [...strings(node.left, seen), ...strings(node.right, seen)];
    if (node.type === "TemplateLiteral" && !node.expressions.length)
      return [node.quasis[0]?.value.cooked ?? ""];
    return [];
  }
  function objectTypes(node: Node | null | undefined, seen = new Set<string>()): string[] {
    if (!node) return [];
    if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression")
      return objectTypes(node.expression, seen);
    if (node.type === "Identifier" && !seen.has(node.name))
      return objectTypes(bindings.get(node.name), new Set([...seen, node.name]));
    if (node.type !== "ObjectExpression") return [];
    return node.properties.flatMap((property) => {
      if (property.type === "SpreadElement") return objectTypes(property.argument, seen);
      const key = property.key;
      if ((key.type === "Identifier" && key.name === "type") || strings(key).includes("type"))
        return strings(property.value);
      return [];
    });
  }
  return nodes.flatMap((node) => {
    let types: string[] = [];
    if (node.type === "JSXOpeningElement")
      types = node.attributes.flatMap((attribute) => {
        if (attribute.type === "JSXSpreadAttribute") return objectTypes(attribute.argument);
        return attribute.name.type === "JSXIdentifier" && attribute.name.name === "type"
          ? strings(attribute.value)
          : [];
      });
    if (
      node.type === "CallExpression" &&
      ((node.callee.type === "Identifier" && node.callee.name === "createElement") ||
        (node.callee.type === "MemberExpression" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "createElement"))
    )
      types = objectTypes(node.arguments[1]);
    if (
      node.type === "AssignmentExpression" &&
      node.left.type === "MemberExpression" &&
      ((node.left.property.type === "Identifier" && node.left.property.name === "type") ||
        strings(node.left.property).includes("type"))
    )
      types = strings(node.right);
    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      node.callee.property.type === "Identifier" &&
      node.callee.property.name === "setAttribute" &&
      strings(node.arguments[0]).includes("type")
    )
      types = strings(node.arguments[1]);
    if (!types.some((type) => nativeDateTypes.has(type.toLowerCase()))) return [];
    const line = source.slice(0, node.start).split("\n").length;
    return [
      `${path}:${line}: native date/time input is forbidden in DOM UI; use @raypx/ui/date-picker and UI Input/Select for time`,
    ];
  });
}

export function checkDomDateInputs(root: string, index: WorkspaceIndex): string[] {
  return index.workspaces.flatMap((workspace) => {
    // Native applications keep platform controls; infer them from their direct runtime dependency.
    if (workspace.manifest.dependencies?.["react-native"]) return [];
    return globSync("{src,app}/**/*.{ts,tsx,js,jsx}", {
      cwd: join(root, workspace.path),
      exclude: ["**/*.test.*", "**/*.spec.*", "**/*.gen.*", "**/tests/**", "**/__tests__/**"],
    }).flatMap((file) => {
      const path = `${workspace.path}/${file}`.replaceAll("\\", "/");
      return nativeDateInputViolations(path, readFileSync(join(root, path), "utf8"));
    });
  });
}
