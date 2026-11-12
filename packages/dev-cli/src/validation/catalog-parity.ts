import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import type { CatalogTree as MessageTree } from "../repo/catalogs.js";

export interface IcuSignature {
  arguments: string[];
  tags: string[];
}
/** Compare callback and value names without constraining language-specific plural branches. */
export function extractIcuSignature(message: string): IcuSignature {
  const arguments_ = new Set<string>();
  const tags = new Set<string>();
  function visit(nodes: MessageFormatElement[]): void {
    for (const node of nodes) {
      if (node.type === TYPE.literal || node.type === TYPE.pound) continue;
      if (node.type === TYPE.tag) {
        tags.add(node.value);
        visit(node.children);
        continue;
      }
      arguments_.add(node.value);
      if (node.type === TYPE.select || node.type === TYPE.plural) {
        for (const option of Object.values(node.options)) visit(option.value);
      }
    }
  }
  visit(parse(message));
  return { arguments: [...arguments_].sort(), tags: [...tags].sort() };
}
export function extractIcuArguments(message: string): string[] {
  return extractIcuSignature(message).arguments;
}

export interface CatalogIssue {
  kind: "parse" | "parity";
  path: string;
  locale?: string;
  side?: "left" | "right";
  message: string;
  fix: string;
}

/** Shared by catalog assertions and diagnostics; paths and name sets have stable ordering. */
export function compareMessageCatalogs(
  leftCatalog: string | MessageTree,
  rightCatalog: string | MessageTree,
  leftLocale = "left",
  rightLocale = "right",
): CatalogIssue[] {
  function compare(left: unknown, right: unknown, path: string[]): CatalogIssue[] {
    const label = path.join(".") || "<root>";
    const parity = (message: string, fix: string): CatalogIssue[] => [
      { kind: "parity", path: label, message, fix },
    ];
    if (left === undefined || right === undefined) {
      const locale = left === undefined ? leftLocale : rightLocale;
      return [
        {
          kind: "parity",
          path: label,
          side: left === undefined ? "left" : "right",
          locale,
          message: `${locale} is missing ${label}`,
          fix: `add ${label} to the ${locale} catalog`,
        },
      ];
    }
    function isTree(value: unknown): value is MessageTree {
      return typeof value === "object" && value !== null && !Array.isArray(value);
    }
    const invalid: CatalogIssue[] = [];
    for (const [value, locale, side] of [
      [left, leftLocale, "left"],
      [right, rightLocale, "right"],
    ] as const) {
      if (typeof value !== "string" && !isTree(value))
        invalid.push({
          kind: "parity",
          path: label,
          locale,
          side,
          message: `${locale} contains an invalid catalog node at ${label}`,
          fix: `use an object or string at ${label} in the ${locale} catalog`,
        });
    }
    if (invalid.length) return invalid;
    if (typeof left !== typeof right)
      return parity(
        `${label} changes node type between ${leftLocale} and ${rightLocale}`,
        "keep the same object or string shape in both catalogs",
      );
    if (typeof left === "string" && typeof right === "string") {
      const signatures: IcuSignature[] = [];
      const parseIssues: CatalogIssue[] = [];
      for (const [message, locale, side] of [
        [left, leftLocale, "left"],
        [right, rightLocale, "right"],
      ] as const) {
        try {
          signatures.push(extractIcuSignature(message));
        } catch {
          parseIssues.push({
            kind: "parse",
            path: label,
            locale,
            side,
            message: `${locale} contains invalid ICU syntax at ${label}`,
            fix: `repair ${label} in the ${locale} catalog`,
          });
        }
      }
      if (parseIssues.length) return parseIssues;
      const [leftSignature, rightSignature] = signatures as [IcuSignature, IcuSignature];
      const issues: CatalogIssue[] = [];
      if (leftSignature.arguments.join(",") !== rightSignature.arguments.join(","))
        issues.push(
          ...parity(
            `${label} changes ICU arguments between ${leftLocale} and ${rightLocale}`,
            `keep ICU argument names aligned: ${leftSignature.arguments.join(", ") || "none"}`,
          ),
        );
      if (leftSignature.tags.join(",") !== rightSignature.tags.join(","))
        issues.push(
          ...parity(
            `${label} changes rich-text tags between ${leftLocale} and ${rightLocale}`,
            `keep rich-text callback names aligned: ${leftSignature.tags.join(", ") || "none"}`,
          ),
        );
      return issues;
    }
    const leftTree = left as MessageTree;
    const rightTree = right as MessageTree;
    return [...new Set([...Object.keys(leftTree), ...Object.keys(rightTree)])]
      .sort()
      .flatMap((key) => compare(leftTree[key], rightTree[key], [...path, key]));
  }
  return compare(leftCatalog, rightCatalog, []);
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
