# syntax=docker/dockerfile:1
FROM oven/bun:1.4.4 AS bun

FROM bun AS manifests
WORKDIR /app
COPY . .
RUN bun deploy/manifests.ts /app /manifests

FROM bun AS migrate-dependencies
WORKDIR /app
COPY --from=manifests /manifests/ ./
RUN --mount=type=cache,id=raypx-bun-install,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile --production --filter @raypx/database --ignore-scripts

FROM bun AS migrate
WORKDIR /app
COPY --from=migrate-dependencies /app/ ./
COPY packages/database/src/ ./packages/database/src/
COPY packages/database/drizzle-foundation/ ./packages/database/drizzle-foundation/
USER bun
CMD ["bun", "run", "--cwd", "packages/database", "migrate"]

FROM node:24.15.0-bookworm-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=raypx-bun-install,target=/root/.bun/install/cache,sharing=locked \
    VP_GIT_HOOKS=0 bun install --frozen-lockfile
ARG VITE_APP_RELEASE=unversioned
ENV VITE_APP_RELEASE=$VITE_APP_RELEASE
RUN --mount=type=cache,id=raypx-turbo,target=/app/.turbo/cache,sharing=locked \
    bun run build:api

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=production NITRO_PORT=3002 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/api/.output ./.output
USER node
EXPOSE 3002
CMD ["node", ".output/server/index.mjs"]
