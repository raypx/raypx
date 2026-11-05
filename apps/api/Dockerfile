# syntax=docker/dockerfile:1
ARG NODE_VERSION=24.22.2
FROM node:${NODE_VERSION}-bookworm AS node
WORKDIR /app

FROM node AS manifests
COPY . .
RUN node deploy/manifests.ts /app /manifests

FROM node AS dependencies
COPY --from=manifests /manifests/ ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')" && VP_GIT_HOOKS=0 pnpm install --frozen-lockfile

FROM dependencies AS migration-build
COPY . .
RUN pnpm --dir packages/database run build
RUN pnpm --dir apps/api run build:fixture

FROM node:${NODE_VERSION}-bookworm-slim AS migrate
WORKDIR /app
COPY --from=migration-build --chown=node:node /app/packages/database/dist ./migration/dist
COPY --from=migration-build --chown=node:node /app/packages/database/drizzle-foundation ./migration/drizzle-foundation
USER node
CMD ["node", "migration/dist/commands.mjs", "migrate"]

FROM dependencies AS build
COPY . .
ARG VITE_APP_RELEASE
ARG RAILWAY_GIT_COMMIT_SHA
ENV VITE_APP_RELEASE=$VITE_APP_RELEASE RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
# Build sandboxes may already own a seccomp listener; VP's syscall tracing cannot nest.
RUN pnpm run build:api --no-cache

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production NITRO_PORT=3002 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/api/.output ./.output
USER node
EXPOSE 3002
CMD ["node", ".output/server/index.mjs"]

FROM runtime AS deploy
COPY --from=migration-build --chown=node:node /app/packages/database/dist ./migration/dist
COPY --from=migration-build --chown=node:node /app/packages/database/drizzle-foundation ./migration/drizzle-foundation
COPY --from=migration-build --chown=node:node /app/apps/api/artifacts/fixture ./fixture
