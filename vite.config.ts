import { repositoryTaskConfig } from "@raypx/tooling/tasks";
import { defineConfig } from "vite-plus";

export default defineConfig({
  ...repositoryTaskConfig(import.meta.url),
  fmt: {},
  staged: {
    "*.{ts,tsx,json,md,css,toml}": "bun --bun vp fmt --write",
    // oxlint only reads scripts and fails when a commit stages none.
    "*.{ts,tsx}": "bun --bun vp lint --fix",
  },
  lint: {
    plugins: [
      "typescript",
      "unicorn",
      "oxc",
      "import",
      "react",
      "vitest",
      "jsx-a11y",
      "promise",
      "node",
    ],
    // Keep bug checks broad; select performance rules instead of enforcing every optimization.
    categories: { correctness: "error", suspicious: "error" },
    ignorePatterns: [
      "**/dist/**",
      "**/.output/**",
      "**/node_modules/**",
      "docs/history/**",
      "**/*.gen.ts",
    ],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    options: {
      typeAware: true,
      typeCheck: true,
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "array-callback-return": "error",
      eqeqeq: "error",
      "prefer-const": "error",
      "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
      "import/no-cycle": "error",
      "oxc/no-accumulating-spread": "error",
      "react/rules-of-hooks": "error",
      "react/no-danger": "error",
      "typescript/consistent-type-imports": ["error", { disallowTypeAnnotations: false }],
      "typescript/switch-exhaustiveness-check": "error",

      // Bootstrap imports and third-party default exports need no prescribed import style.
      "import/no-unassigned-import": "off",
      "import/no-named-as-default": "off",
      "import/no-named-as-default-member": "off",
      // Void completions and callback adapters are valid; type-aware Promise checks stay enabled.
      "promise/always-return": "off",
      "promise/no-callback-in-promise": "off",
      "promise/no-promise-in-callback": "off",
      // exhaustive-deps catches missing dependencies while allowing deliberate lifecycle triggers.
      "react/exhaustive-effect-dependencies": "off",
      // Automatic JSX runtime and inferred mock implementations need no redundant annotations.
      "react/react-in-jsx-scope": "off",
      "vitest/require-mock-type-parameters": "off",
      // Planned tests and snapshot labels should not block development.
      "vitest/warn-todo": "off",
      "vitest/prefer-snapshot-hint": "off",
      // TypeScript checks return types; boundary adapters and fixtures deliberately narrow values.
      "typescript/consistent-return": "off",
      "typescript/no-unsafe-type-assertion": "off",
      // The shared ES2022 library does not expose Array.prototype.toSorted/toReversed.
      "unicorn/no-array-sort": "off",
      "unicorn/no-array-reverse": "off",
      // Keep naming, helper placement, ARIA semantics and deliberate focus under local control.
      "no-underscore-dangle": "off",
      "unicorn/consistent-function-scoping": "off",
      "jsx-a11y/prefer-tag-over-role": "off",
      "jsx-a11y/no-autofocus": "off",
    },
    overrides: [
      {
        files: ["apps/mobile/**/*.tsx"],
        // Expo StatusBar accepts a string style, unlike a DOM element's style prop.
        rules: { "react/style-prop-object": ["error", { allow: ["StatusBar"] }] },
      },
    ],
  },
});
