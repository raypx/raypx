/**
 * Raypx Oxlint Plugin
 *
 * Custom lint rules for enforcing raypx architecture boundaries.
 */

import { definePlugin, defineRule } from "vite-plus/lint/plugins";

// Rule: enforce-public-exports
const enforcePublicExportsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Enforce using public exports for workspace dependencies",
      recommended: true,
    },
    messages: {
      privateImport:
        "Do not import from {{package}}/{{path}}. Use public exports from {{package}}.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source;
        if (!source || source.type !== "Literal" || typeof source.value !== "string") {
          return;
        }

        const specifier = source.value;
        const privatePathRegex = /^@raypx\/([^/]+)\/(src|dist)\//;
        const match = specifier.match(privatePathRegex);

        if (match) {
          const packageName = `@raypx/${match[1]}`;
          const privatePath = match[2];

          context.report({
            node: source,
            messageId: "privateImport",
            data: {
              package: packageName,
              path: privatePath,
            },
          });
        }
      },
    };
  },
});

// Rule: no-server-in-client
const noServerInClientRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Prevent client code from importing server packages",
      recommended: true,
    },
    messages: {
      serverInClient:
        "Cannot import server package '{{package}}' in client code. Use API routes or server functions instead.",
    },
  },
  create(context) {
    const SERVER_PACKAGES = [
      "@raypx/db",
      "@raypx/auth",
      "@raypx/storage",
      "@raypx/logger",
      "@raypx/worker",
      "@raypx/api",
      "@raypx/env/server",
    ];

    const CLIENT_PATTERNS = [
      /apps\/web\/src\/features\//,
      /apps\/web\/src\/components\//,
      /packages\/ui\/src\//,
      /packages\/client\/src\//,
      /packages\/contracts\/src\//,
    ];

    const filename = context.filename;
    const isClientFile = CLIENT_PATTERNS.some((pattern) => pattern.test(filename));
    const isServerFile = filename.includes(".server.");

    if (!isClientFile || isServerFile) {
      return {};
    }

    return {
      ImportDeclaration(node) {
        const source = node.source;
        if (!source || source.type !== "Literal" || typeof source.value !== "string") {
          return;
        }

        const specifier = source.value;
        const serverPkg = SERVER_PACKAGES.find((pkg) => specifier.startsWith(pkg));

        if (serverPkg) {
          context.report({
            node: source,
            messageId: "serverInClient",
            data: {
              package: serverPkg,
            },
          });
        }
      },
    };
  },
});

// Rule: prefer-workspace-alias
const preferWorkspaceAliasRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer workspace aliases over relative imports for cross-package imports",
      recommended: false,
    },
    messages: {
      useAlias: "Use workspace alias '{{alias}}' instead of relative import across packages.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source;
        if (!source || source.type !== "Literal" || typeof source.value !== "string") {
          return;
        }

        const specifier = source.value;

        // Only check relative imports
        if (!specifier.startsWith(".")) {
          return;
        }

        // Check if this is a cross-package relative import
        const crossPackageRegex = /\.\.\/\.\.\/packages\/([^/]+)/;
        const match = specifier.match(crossPackageRegex);

        if (match) {
          const packageName = match[1];
          const alias = `@raypx/${packageName}`;

          context.report({
            node: source,
            messageId: "useAlias",
            data: {
              alias,
            },
          });
        }
      },
    };
  },
});

// Export the plugin
export default definePlugin({
  meta: {
    name: "raypx",
  },
  rules: {
    "enforce-public-exports": enforcePublicExportsRule,
    "no-server-in-client": noServerInClientRule,
    "prefer-workspace-alias": preferWorkspaceAliasRule,
  },
});
