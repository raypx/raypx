# ADR 0064 — JSON message catalogs with generated literal types

Date: 2026-11-13

Status: Accepted. Supersedes the mixed TS/JSON catalog formats and the rule against
generated catalog sources described with [ADR 0055](0055-in-repo-intl-runtime.md).

Every namespace catalog is `locales/<language>/<namespace>.json` in every language.
Translation platforms and automated translators read and write JSON directly, and one
format removes the per-language choice the validator had to arbitrate. Language
`index.ts` entries stay handwritten and assemble their namespaces with JSON imports.

TypeScript widens every value of an imported JSON module to `string`, which would
drop the ICU argument and rich-text tag checks at call sites. `raypx-dev i18n types`
therefore writes `<namespace>.d.json.ts` beside each reference-language catalog,
restating its values as literal types, and the shared TypeScript preset enables
`allowArbitraryExtensions` so the compiler uses it. The declaration uses `export =`
so the default import is typed under both NodeNext and Bundler resolution. This is
the approach next-intl documents for typed JSON messages; it becomes unnecessary if
TypeScript infers literal types for JSON modules.

Declarations are derived, ignored by Git and never edited. The root Turbo task
`//#i18n:types` writes them, declares them as cached outputs, and every `check` and
the root `types` task depend on it. Run `bun run i18n:types` after editing an English
catalog outside those tasks so the editor sees new keys and arguments. Translated
languages need no declaration: the static validator owns their key, ICU argument and
tag parity, and rejects a TypeScript catalog.
