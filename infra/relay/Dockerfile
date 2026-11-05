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

FROM dependencies AS build
COPY . .
ARG VITE_APP_RELEASE
ARG RAILWAY_GIT_COMMIT_SHA
ENV VITE_APP_RELEASE=$VITE_APP_RELEASE RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
# Build sandboxes may already own a seccomp listener; VP's syscall tracing cannot nest.
RUN pnpm run build:relay --no-cache

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3003 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/infra/relay/dist ./dist
USER node
EXPOSE 3003
CMD ["node", "dist/main.js"]
