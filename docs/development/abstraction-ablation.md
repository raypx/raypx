# Abstraction ablation

Date: September 17, 2026. Baseline: `d8440b1`.

## Method

Inspect production callers, remove one layer at a time, and compare the same
observable behavior before and after. Keep a removal only when it reduces the
concepts a caller or maintainer must understand without moving that complexity
into callers. Tests for a removed internal layer move to the surviving boundary;
their assertions are not discarded.

The targeted slices initially rated 6/10 on the refactoring skill's qualitative
rubric: speculative generality, middle-man wrappers, and duplicate validation.
The concrete remedies were to use the existing library parser, inline forwarding
factories, remove an unused barrel, and consolidate validation. Line counts below
measure the size of those slices, not performance or overall repository quality.

## Experiments

| Candidate                            | Evidence and change                                                                                                                                                                                                                                     | Implementation lines | Decision       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------- |
| Environment schema-provider protocol | Every production preset uses Zod. Replace the custom Standard Schema protocol, dictionary parser, and generic output utilities with Zod parsing and inference. Keep recursive presets, defaults, transforms, synchronous validation, and access guards. | 572 → 334            | Keep removal   |
| Public Auth capability adapter       | One implementation wraps one typed procedure. The hook now accepts a request function; the default calls the same procedure through the existing Web API client.                                                                                        | 53 → 35              | Keep removal   |
| Desktop snapshot revalidation        | The normalizer already checks every field the second validator checks. Test malformed values at that boundary and remove the duplicate traversal.                                                                                                       | 361 → 275            | Keep removal   |
| Desktop page barrel                  | No imports use `App.tsx`; routes already import feature pages directly. Remove it and its artificial Knip entrypoint.                                                                                                                                   | 8 → 0                | Keep removal   |
| Browser environment access guard     | Temporarily remove the guard and run the existing browser-access test. It fails because accessing a server variable no longer throws. Restore the guard.                                                                                                | No retained change   | Reject removal |

The four retained removals reduce their implementation from 994 to 644 lines
(350 lines, about 35%). Three implementation files disappear. `@voidmix/shared/env`
also loses its direct `type-fest` dependency and the repository's unused catalog
entry; other tools may still require that package transitively.

## Behavior checks

- Environment: the original six tests passed before editing. Four additional
  characterization tests also passed against the old implementation, covering
  defaults, override inference, validation diagnostics, and inherited browser
  fields. The final suite adds a compile-time prefix check with runtime access
  assertions, for eleven tests. No original assertion was removed.
- Auth capabilities: all three existing scenarios pass through the simplified
  hook: the typed public procedure, successful replacement of navigation
  defaults, and retaining those defaults when the request fails. The default
  request function remains stable between renders and effect cleanup still
  ignores late responses.
- Desktop snapshots: 26 malformed-field cases passed against the normalizer
  before removing the second validator and pass afterward. The two former
  validator tests now exercise normalization; legacy localized dates, structured
  details, invalid storage sizes, and source-selection behavior remain covered.
- Desktop page barrel: all 34 baseline Desktop tests passed before removal;
  the route import graph and both Desktop typecheck passes remain intact.
- Negative control: removing the environment access guard makes
  `blocks server values on the client` fail with `expected [Function] to throw
an error`. The guard is restored in the final implementation.

Run the focused suites with:

```bash
bun run --cwd packages/shared test
bun run --cwd apps/web test capabilities
bun run --cwd apps/desktop test
```

The final `bun run verify` passed, covering policy, formatting, lint, every
workspace's types and tests, builds, and server startup probes.
The unrelated Project Studio E2E failures recorded during the dependency upgrade
are outside this gate and this experiment.

## Boundaries retained

The API client still owns transport configuration, the environment proxy still
guards server-only access, and snapshot normalization still handles supported
wire formats. Repository interfaces still separate domain behavior from database
adapters. Removing these would move policy or validation into callers, or remove
behavior that existing tests require.

Further removals should use the same caller and behavior checks. A low consumer
count alone is insufficient evidence to remove a security rule, a format
conversion, a transaction contract, or a testable I/O boundary.
