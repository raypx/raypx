# syntax=docker/dockerfile:1
FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
# Browser and server rendering both use the API origin baked into this build.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN bun run build:web

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=production NITRO_PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
