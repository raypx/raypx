# syntax=docker/dockerfile:1
ARG NODE_VERSION=24.22.2
FROM node:${NODE_VERSION}-bookworm AS node
WORKDIR /app

FROM node AS pnpm
COPY package.json ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"

FROM pnpm AS manifests
COPY . .
RUN node deploy/manifests.ts /app /manifests

FROM pnpm AS dependencies
COPY --from=manifests /manifests/ ./
RUN VP_GIT_HOOKS=0 pnpm install --frozen-lockfile \
    --filter . --filter '{./apps/web}...'

FROM dependencies AS build
COPY . .
ARG VITE_API_URL
ARG VITE_APP_RELEASE
ARG RAILWAY_GIT_COMMIT_SHA
ENV VITE_API_URL=$VITE_API_URL VITE_APP_RELEASE=$VITE_APP_RELEASE RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
# Build sandboxes may already own a seccomp listener; VP's syscall tracing cannot nest.
RUN pnpm run build:web --no-cache

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production NITRO_PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
