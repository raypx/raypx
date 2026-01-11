# Stage 1: Builder
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache make g++ python3

# Install dependencies
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY packages ./packages

RUN bun install --frozen-lockfile

# Build server
COPY . .
RUN bun run build --filter=server

# Stage 2: Runner
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/apps/server/dist ./dist

EXPOSE 3001

CMD ["bun", "run", "dist/index.js"]
