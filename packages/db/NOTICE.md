# Historical database provenance

The retired database implementation consumed the independently published
`@voidmix/drizzle` package. Its source adaptations and complete upstream notices
are maintained in [Voidmix](https://github.com/raypx/voidmix).

The account foundation uses the public Drizzle and postgres.js APIs directly and
contains no copied helper implementation. The `drizzle/` and `drizzle-cloud/`
directories retain historical migration artifacts only; new deployments use
`drizzle-foundation/` and its independent migration history.
