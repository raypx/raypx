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
# Browser and server rendering both use the API origin baked into this build.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_APP_RELEASE
ARG RAILWAY_GIT_COMMIT_SHA
ENV VITE_APP_RELEASE=$VITE_APP_RELEASE
ENV RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
RUN bun run build:web

FROM oven/bun:1.4.4-slim AS runtime
ENV NODE_ENV=production NITRO_PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=bun:bun /app/apps/web/.output ./.output
USER bun
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
