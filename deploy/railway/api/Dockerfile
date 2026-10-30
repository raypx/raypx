# Railway requires literal service-specific cache mount IDs.
# Use portable Docker dependency layers; keep Bun/manifests aligned with apps/api/Dockerfile.
# syntax=docker/dockerfile:1
# The bun, manifests and dependencies stages match apps/web/Dockerfile exactly, so
# one builder reuses the installed workspace for both images.
FROM oven/bun:1.4.4 AS bun

FROM bun AS manifests
WORKDIR /app
COPY . .
RUN bun deploy/manifests.ts /app /manifests

# Dependencies change only with package manifests or bun.lock, not with source edits.
FROM bun AS dependencies
WORKDIR /app
COPY --from=manifests /manifests/ ./
RUN VP_GIT_HOOKS=0 bun install --frozen-lockfile

FROM bun AS migrate-dependencies
WORKDIR /app
COPY --from=manifests /manifests/ ./
RUN bun install --frozen-lockfile --production --filter @raypx/database --ignore-scripts

FROM bun AS migrate
WORKDIR /app
COPY --from=migrate-dependencies /app/ ./
COPY packages/database/src/ ./packages/database/src/
COPY packages/database/drizzle-foundation/ ./packages/database/drizzle-foundation/
USER bun
CMD ["bun", "run", "--cwd", "packages/database", "migrate"]

FROM dependencies AS build
COPY . .
ARG VITE_APP_RELEASE=unversioned
ENV VITE_APP_RELEASE=$VITE_APP_RELEASE
RUN bun run build:api

FROM oven/bun:1.4.4-slim AS runtime
ENV NODE_ENV=production NITRO_PORT=3002 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=bun:bun /app/apps/api/.output ./.output
USER bun
EXPOSE 3002
CMD ["bun", ".output/server/index.mjs"]

# Railway runs migrations in an isolated pre-deploy container from this image.
# Compose explicitly selects runtime above, keeping its separate migration image.
FROM runtime AS railway
COPY --from=migrate-dependencies --chown=bun:bun /app/ ./
COPY --chown=bun:bun packages/database/src/ ./packages/database/src/
COPY --chown=bun:bun packages/database/drizzle-foundation/ ./packages/database/drizzle-foundation/
