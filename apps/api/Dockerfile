# Stage 1: Builder
FROM oven/bun:1 AS builder

WORKDIR /app

ENV NODE_ENV=production

# Copy source code
COPY . .

# Install all dependencies (including devDependencies for tsdown)
RUN bun install --frozen-lockfile --ignore-scripts

# Build the API service
WORKDIR /app/apps/api
RUN bun run build

# Stage 2: Runner
FROM oven/bun:1 AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3001

# Copy only production dependencies and built files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock

# Install curl for health check
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Health check
HEALTHCHECK --interval=5s --timeout=10s \
  CMD curl http://0.0.0.0:${PORT}/health || exit 1

# Start the API server
WORKDIR /app
CMD ["bun", "run", "dist/index.js"]
