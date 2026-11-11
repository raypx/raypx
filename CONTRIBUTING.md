# Contributing

Read [AGENTS.md](AGENTS.md) and the owning workspace instructions. Run narrow tests
then `bun run verify`. Keep workspace metadata, public exports and dependencies
accurate. Use `bun run workspace:new` for new packages and avoid empty abstractions.

Use isolated test databases. Default verification requires no database, GUI or
emulator. PostgreSQL, browsers and packaged native release gates
are documented in [testing](docs/development/testing.md). Report unavailable checks.

## Commit messages

Use `type(scope)!: summary` on the first nonblank line. The scope and `!` are optional.
Choose a type from `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`,
`refactor`, `revert`, `style`, and `test`.

When a scope helps identify the affected area, use lowercase letters, digits,
and hyphens, starting with a letter or digit. Write a short, imperative summary.
Use `!` for a breaking change and explain the impact in a `BREAKING CHANGE:` footer.
Separate any body or footers from the subject with a blank line.

```text
feat(cli): add session filters
docs: explain local profiles
fix(remote-tasks)!: require device-scoped grants
```

The local `commit-msg` hook validates the subject format and accepts Git's default
merge, revert, and autosquash subjects. Run `bun run prepare` to install the Git
hooks if they are missing.
