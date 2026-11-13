# syntax=docker/dockerfile:1
ARG BUN_IMAGE_DIGEST
FROM oven/bun:1.4.4@sha256:${BUN_IMAGE_DIGEST} AS bun
FROM bun AS build
WORKDIR /app
COPY . .
RUN VP_GIT_HOOKS=0 bun install --frozen-lockfile && bun run --cwd infra/sandbox check && bun run --cwd infra/sandbox build
FROM bun
WORKDIR /app
COPY --from=build /app/infra/sandbox/dist/server.mjs ./server.mjs
RUN mkdir -p /var/lib/raypx-sandbox && chmod 700 /var/lib/raypx-sandbox
CMD ["bun", "server.mjs"]
