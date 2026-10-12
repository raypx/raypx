# syntax=docker/dockerfile:1
FROM node:24.18.0-alpine AS tools
COPY --from=oven/bun:1.4.0-alpine /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

FROM tools AS prune
COPY . .
RUN turbo_version=$(node -p "require('./package.json').workspaces.catalogs.tooling.turbo") && \
    bun x "turbo@$turbo_version" prune @voidmix/api --docker

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
RUN bun run build:api

FROM node:24.18.0-alpine AS runtime
ENV NODE_ENV=production

WORKDIR /app/apps/api

COPY --chown=node:node --from=build /app/apps/api/.output ./.output
COPY --chown=node:node --from=build /app/apps/api/scripts ./scripts

USER node
EXPOSE 3002

CMD ["sh", "-c", "if [ -f /app/.env ]; then exec node --env-file=/app/.env --enable-source-maps scripts/start.mjs; else exec node --enable-source-maps scripts/start.mjs; fi"]
