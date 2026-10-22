# syntax=docker/dockerfile:1
FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build:api

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=production NITRO_PORT=3002 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/api/.output ./.output
USER node
EXPOSE 3002
CMD ["node", ".output/server/index.mjs"]
