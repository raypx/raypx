# syntax=docker/dockerfile:1
# The bun, manifests and dependencies stages match apps/api/Dockerfile exactly, so
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

FROM dependencies AS build
COPY . .
# Retired build inputs fail even when explicitly supplied empty.
ARG VITE_API_URL
RUN if [ "${VITE_API_URL+present}" = present ]; then echo "VITE_API_URL is no longer supported; use runtime API_PUBLIC_URL on Web for split origins" >&2; exit 1; fi
ARG VITE_APP_RELEASE
ARG RAILWAY_GIT_COMMIT_SHA
ENV VITE_APP_RELEASE=$VITE_APP_RELEASE
ENV RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
# Build this workspace directly in the Git-free context. Docker owns caching.
RUN bun run --cwd apps/web check && bun run --cwd apps/web build

FROM oven/bun:1.4.4-slim AS runtime
ENV NODE_ENV=production NITRO_PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=bun:bun /app/apps/web/.output ./.output
USER bun
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
