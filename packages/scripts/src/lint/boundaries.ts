import { relative } from "node:path";
import { defineRule, type ESTree } from "vite-plus/lint/plugins";
import { sourceImportViolations, type ArchitectureIndex } from "../architecture/model.ts";

export function createBoundariesRule(loadIndex: () => ArchitectureIndex, repositoryRoot: string) {
  return defineRule({
    meta: {
      type: "problem",
      docs: { description: "Enforce Raypx workspace and renderer source boundaries" },
      messages: { boundary: "{{message}}" },
      schema: [],
    },
    create(context) {
      const file = relative(repositoryRoot, context.filename).split("\\").join("/");
      const index = loadIndex();
      function check(source: ESTree.Expression | ESTree.StringLiteral | null | undefined) {
        if (source?.type !== "Literal" || typeof source.value !== "string") return;
        for (const message of sourceImportViolations(index, file, source.value))
          context.report({ node: source, messageId: "boundary", data: { message } });
      }
      return {
        ImportDeclaration(node) {
          check(node.source);
        },
        ExportNamedDeclaration(node) {
          check(node.source);
        },
        ExportAllDeclaration(node) {
          check(node.source);
        },
        ImportExpression(node) {
          check(node.source);
        },
        TSImportType(node) {
          check(node.source);
        },
      };
    },
  });
}
