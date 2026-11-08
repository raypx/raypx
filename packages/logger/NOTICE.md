# Source provenance

The logger facade, context, pipeline, safe-event policy, stream drain and their
tests originated in `raypx/raypx-kit`, package `@raypx-kit/logger`, based on commit
`6825b3037236f6833d855813aa1335c35a33109b` (version `0.0.0-alpha.2`).
The managed drain and its tests were developed locally on 2026-10-26 and moved
here before publication. They are now maintained in this private Raypx workspace.
The original Apache-2.0 license is retained in `LICENSE`.

evlog itself is an external dependency, not copied source. Its own package retains
its upstream license. Future extraction can follow the Kit workflow after the
product's logging behavior has stabilized.
