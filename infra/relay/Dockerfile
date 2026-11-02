# syntax=docker/dockerfile:1
FROM oven/bun:1.4.4 AS bun

FROM bun AS manifests
WORKDIR /app
COPY . .
RUN bun deploy/manifests.ts /app /manifests

FROM bun AS dependencies
WORKDIR /app
COPY --from=manifests /manifests/ ./
RUN VP_GIT_HOOKS=0 bun install --frozen-lockfile

FROM dependencies AS build
COPY . .
ARG VITE_APP_RELEASE
ARG RAILWAY_GIT_COMMIT_SHA
ENV VITE_APP_RELEASE=$VITE_APP_RELEASE
ENV RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
RUN bun run build:relay

FROM oven/bun:1.4.4-slim AS runtime
ENV NODE_ENV=production PORT=3003 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=bun:bun /app/infra/relay/dist ./dist
USER bun
EXPOSE 3003
CMD ["bun", "dist/main.js"]
