# Infrastructure

Infrastructure is organized as private Node workspaces with their own dependencies,
deployment commands, type checks and tests. Install dependencies from the repository
root with `pnpm install`.

| Workspace              | Responsibility                                                | Guide                              |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------- |
| `@raypx/infra-railway` | Railway API, Web, Relay and gateway service definitions       | [Railway](railway/README.md)       |
| `relay`                | Independent Node WebSocket service and private-broker routing | [Relay](relay/README.md)           |
| `relay-cloudflare`     | Optional Workers ingress and Node Relay Container deployment  | [Cloudflare](cloudflare/README.md) |

Run focused checks from the repository root:

```sh
pnpm --dir infra/railway run check
pnpm run test --package @raypx/infra-railway
```

The repository's `check`, `test` and `verify` commands discover these workspaces.
Application code and Dockerfiles live in their owning app/infra workspace; shared ports and ingress rules
belong to `@raypx/tooling/build/deployment`. Dokploy Compose deployment remains in
[`deploy/`](../deploy/AGENTS.md), and root `compose.yaml` provides local development
services. See [deployment](../docs/development/deployment.md).
