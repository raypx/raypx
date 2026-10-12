import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import type { MessageTree } from "./types.js";

export function extractIcuArguments(message: string): string[] {
  const names = new Set<string>();
  function visit(nodes: MessageFormatElement[]): void {
    for (const node of nodes) {
      if (node.type === TYPE.literal || node.type === TYPE.pound) continue;
      if (node.type === TYPE.tag) {
        visit(node.children);
        continue;
      }
      names.add(node.value);
      if (node.type === TYPE.select || node.type === TYPE.plural) {
        for (const option of Object.values(node.options)) visit(option.value);
      }
    }
  }
  visit(parse(message));
  return [...names].sort();
}

export interface CatalogIssue {
  kind: "parse" | "parity";
  message: string;
  fix: string;
}

/** Shared by catalog assertions and repository diagnostics; paths are sorted for stable output. */
export function compareMessageCatalogs(
  left: string | MessageTree,
  right: string | MessageTree,
  leftLocale = "left",
  rightLocale = "right",
): CatalogIssue[] {
  function compare(
    left: string | MessageTree | undefined,
    right: string | MessageTree | undefined,
    path: string[],
  ): CatalogIssue[] {
    const label = path.join(".") || "<root>";
    const parity = (message: string, fix: string): CatalogIssue[] => [
      { kind: "parity", message, fix },
    ];
    if (left === undefined || right === undefined) {
      return parity(
        `${left === undefined ? leftLocale : rightLocale} is missing ${label}`,
        `add ${label} to the ${leftLocale} and ${rightLocale} catalogs`,
      );
    }
    if (typeof left !== typeof right) {
      return parity(
        `${label} changes node type between ${leftLocale} and ${rightLocale}`,
        "keep the same object or string shape in both catalogs",
      );
    }
    if (typeof left === "string" && typeof right === "string") {
      try {
        const leftArgs = extractIcuArguments(left);
        const rightArgs = extractIcuArguments(right);
        return leftArgs.join(",") === rightArgs.join(",")
          ? []
          : parity(
              `${label} changes ICU arguments between ${leftLocale} and ${rightLocale}`,
              `keep ICU argument names aligned: ${leftArgs.join(", ") || "none"}`,
            );
      } catch {
        return [
          {
            kind: "parse",
            message: `${label} contains invalid ICU syntax`,
            fix: "repair the ICU message in both catalogs",
          },
        ];
      }
    }
    const leftTree = left as MessageTree;
    const rightTree = right as MessageTree;
    return [...new Set([...Object.keys(leftTree), ...Object.keys(rightTree)])]
      .sort()
      .flatMap((key) => compare(leftTree[key], rightTree[key], [...path, key]));
  }
  return compare(left, right, []);
}

export function assertMessageCatalogParity(
  left: MessageTree,
  right: MessageTree,
  leftLocale = "left",
  rightLocale = "right",
): void {
  const issues = compareMessageCatalogs(left, right, leftLocale, rightLocale);
  if (issues.length > 0)
    throw new Error(
      `Message catalog mismatch:\n${issues.map((issue) => issue.message).join("\n")}`,
    );
}
