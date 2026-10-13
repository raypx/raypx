# Drizzle helper provenance

Reusable adapted implementations are maintained in the independent
[Raypx Packages](https://github.com/raypx/packages) `@raypx/drizzle` package.
Its [NOTICE](https://github.com/raypx/packages/blob/main/packages/drizzle/NOTICE.md)
records pinned commits, modifications and complete upstream license texts.
The verified archive distributed under [vendor](../../vendor/README.md)
also contains those notices and licenses.

Initial implementations were adopted from drizzle-plus commit
`5840bdb4c5b3c7526b7db132f0b14cbe8a89eae9` (MIT, Alec Larson) and better-drizzle
commit `f93f1b7aa528fe2db4cddc92a047e7a0ae710a0d` (Apache-2.0, Hiago Almeida).
The earlier [MIT](THIRD_PARTY_LICENSES) and [Apache-2.0](THIRD_PARTY_LICENSES)
texts remain here for historical attribution. Runtime helper source has one
maintenance location in Toolkit, not a second DB-local fork.

See [ADR-0029](../../docs/architecture/decisions/0029-toolkit-drizzle-extraction.md)
for ownership and consumer validation.
