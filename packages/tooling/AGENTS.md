# @raypx/tooling

## Purpose

Private repository automation exposed as raypx-dev. Turbo owns task orchestration;
this package owns discovery, boundary checks, scaffolding and artifact probes.

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
Preserve the Bun/jsdom preload and independent workspace test runners.

## Verification

Run bun run --cwd packages/tooling test and check, then bun run policy.
