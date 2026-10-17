# @raypx/tooling

## Purpose

Private repository automation exposed as raypx-dev. Turbo owns task orchestration;
`@voidmix/devkit` owns workspace discovery, boundary and toolchain checks, the static
catalog reader, process helpers and artifact staging. This package supplies Raypx
conventions (`src/repository.ts`), policy, locale parity, scaffolding and product probes.

## Interface

- raypx-dev tasks <task> [Turbo flags]
- raypx-dev workspace list | new <name> --kind library --target universal [--write]
- raypx-dev policy | verify | doctor | clean
- raypx-dev env -- <command>, db <operation>, desktop build

## Constraints

No product workspace imports this package at runtime. Do not import db, auth or
client implementations; delegate database commands to db's scripts. Derive all
workspace lists from manifests. Scaffolding previews by default and never overwrites.
Use platform-neutral filesystem/process APIs. Never print loaded secrets.
Generic checks belong in @voidmix/devkit; keep only Raypx-specific rules here.
Preserve the Bun/jsdom preload and independent workspace test runners.

## Verification

Run bun run --cwd packages/tooling test and check, then bun run policy.
