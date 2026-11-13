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

FROM dependencies AS migration-payload
COPY . .
RUN bun --no-env-file build apps/api/src/config/migrate.ts --target=bun --format=esm --minify --packages=bundle --env=disable --outfile=/migration/apps/api/src/config/migrate.ts \
  && cp apps/api/package.json /migration/apps/api/ \
  && mkdir -p /migration/packages/database \
  && printf '%s\n' '{"scripts":{"migrate":"bun run --cwd ../../apps/api db:migrate"}}' > /migration/packages/database/package.json \
  && cp -R packages/database/drizzle-foundation /migration/packages/database/

FROM bun AS migrate
WORKDIR /app
COPY --from=migration-payload /migration/ ./
USER bun
CMD ["bun", "run", "--cwd", "apps/api", "db:migrate"]

FROM dependencies AS build
COPY . .
ARG VITE_APP_RELEASE
ARG RAILWAY_GIT_COMMIT_SHA
ENV VITE_APP_RELEASE=$VITE_APP_RELEASE
ENV RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
# Build this workspace directly in the Git-free context. Docker owns caching.
RUN bun run --cwd apps/api check && bun run --cwd apps/api build

FROM oven/bun:1.4.4-slim AS runtime
ENV NODE_ENV=production NITRO_PORT=3002 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=bun:bun /app/apps/api/.output ./.output
USER bun
EXPOSE 3002
CMD ["bun", ".output/server/index.mjs"]

# The default image supports pre-deploy migrations. Select runtime for an API-only
# image, or migrate for an isolated migration job without the API build.
FROM runtime AS deploy
COPY --from=migration-payload --chown=bun:bun /migration/ ./
