# ADR-0001: Base UI and shadcn base-nova over Radix

## Status

Accepted

## Context

`packages/ui` needs unstyled, accessible interactive primitives. Two ecosystems
are viable: Radix UI, which most shadcn/ui documentation and community examples
assume, and Base UI, which the shadcn `base-nova` style targets.

Choosing by example is dangerous here because the two libraries have **different
APIs for the same components**, not just different internals. Base UI uses a
`render` prop where Radix uses `asChild`; Base UI's `Select` takes an `items`
prop; `ToggleGroup` distinguishes single from multiple selection with `multiple`
rather than `type`; `Slider` values are scalar rather than array; `Accordion`
uses `defaultValue` differently. Code copied from a Radix example compiles
against Base UI in some cases and silently behaves differently in others.

The same split exists for icons. `packages/ui/components.json` sets
`iconLibrary: "phosphor"`, but almost every shadcn example imports
`lucide-react`, so an agent or contributor working from examples will reach for
Lucide by default.

## Decision

`packages/ui` uses **Base UI** primitives with the shadcn **`base-nova`** style,
and **Phosphor Icons**. Radix primitives and Lucide icons are not added.

This covers shared primitives in `packages/ui`. It does not restrict what an
application composes from those primitives, and it does not forbid a plain
unstyled element where no primitive is needed.

## Consequences

- Community shadcn/ui snippets cannot be pasted without checking the Base UI API
  for that component. This is the main ongoing cost.
- `bun run shadcn:update` regenerates against `base-nova`, so generated
  components stay consistent with the choice.
- Any Radix or Lucide dependency appearing in a manifest is a signal that this
  decision was bypassed rather than revisited.
- The rule is stated in the root `AGENTS.md` and in
  [`packages/ui/AGENTS.md`](../../../packages/ui/AGENTS.md); neither is
  mechanically enforced today.

## Follow-up

Revisit if Base UI stops shipping a primitive the product needs and no
reasonable composition covers it. Adding Radix for that single primitive would
require a new ADR naming the component and the containment boundary, because a
mixed-primitive `packages/ui` is materially harder to reason about than either
choice alone.
