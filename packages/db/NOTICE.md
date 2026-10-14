# Drizzle helper provenance

Reusable adapted implementations are maintained in the independent
[Voidmix](https://github.com/raypx/voidmix)
[`@voidmix/drizzle`](https://www.npmjs.com/package/@voidmix/drizzle) package.
Its [NOTICE](https://github.com/raypx/voidmix/blob/main/packages/drizzle/NOTICE.md)
records pinned commits, modifications and complete upstream license texts.
Published npm archives contain the complete notices and licenses for their
respective versions. Raypx consumes that registry package through the root catalog.

Initial implementations were adopted from drizzle-plus commit
`5840bdb4c5b3c7526b7db132f0b14cbe8a89eae9` (MIT, Alec Larson) and better-drizzle
commit `f93f1b7aa528fe2db4cddc92a047e7a0ae710a0d` (Apache-2.0, Hiago Almeida).
Runtime helper source and complete license terms have one maintenance location
in Voidmix; Raypx DB has no second adapted-source or license-text copy.

See [ADR-0029](../../docs/architecture/decisions/0029-toolkit-drizzle-extraction.md)
for ownership and consumer validation.
