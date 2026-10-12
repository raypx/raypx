# syntax=docker/dockerfile:1
FROM node:24.18.0-alpine AS tools
COPY --from=oven/bun:1.4.0-alpine /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

FROM tools AS prune
COPY . .
RUN turbo_version=$(node -p "require('./package.json').workspaces.catalogs.tooling.turbo") && \
    bun x "turbo@$turbo_version" prune @voidmix/web --docker

FROM tools AS build
COPY --from=prune /app/out/json/ ./
# Turbo 2.11.7 omits some optional-peer devDependency resolutions from Bun
# pruned locks. Keep the canonical lock; Bun skips excluded workspaces.
COPY bun.lock ./
# Root postinstall needs shared sources, which arrive in the next layer.
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=prune /app/out/full/ ./
COPY tsconfig.json test.config.ts vite.config.ts turbo.json .gitignore .prettierignore ./
RUN bun run postinstall
ARG VITE_API_URL
ARG VITE_SITE_URL
ARG VITE_SUPPORT_EMAIL
ARG VITE_SENTRY_DSN
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
RUN : "${VITE_API_URL:?Set VITE_API_URL to the standalone API origin before building Web}" \
    && bun run build:web

FROM node:24.18.0-alpine AS runtime
ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0

WORKDIR /app/apps/web

COPY --chown=node:node --from=build /app/apps/web/package.json ./package.json
COPY --chown=node:node --from=build /app/apps/web/.output ./.output

USER node
EXPOSE 3000

CMD ["sh", "-c", "if [ -f /app/.env ]; then exec node --env-file=/app/.env --enable-source-maps .output/server/index.mjs; else exec node --enable-source-maps .output/server/index.mjs; fi"]
