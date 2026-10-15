# @raypx/contracts

## Purpose

Pure transport schemas shared by their consumers.

## Interface

`/api`: public HTTP account contract. `/local`: versioned local CLI/Desktop protocol. `.` re-exports the API seam.

## Ownership

Pure transport schemas shared by their consumers.

## Constraints

No network, environment, filesystem, database or framework implementations. The local protocol never becomes part of the public HTTP router. Local timestamps use ISO strings. Derive DTOs from exported Zod schemas.

## Verification

```sh
bun run --cwd packages/contracts check
bun run --cwd packages/contracts test
```
