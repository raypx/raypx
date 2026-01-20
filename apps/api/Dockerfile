# Stage 1: Builder
FROM oven/bun:1 AS builder

WORKDIR /app

ENV NODE_ENV=production

# Copy source code (including .git for turbo caching)
COPY . .

# Install all dependencies (including devDependencies for build)
# --ignore-scripts skips prepare hook (lefthook install requires git hooks setup)
RUN bun install --frozen-lockfile --ignore-scripts

# Build the application
RUN bun turbo build --filter=api...

# Stage 2: Runner
FROM oven/bun:1 AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install curl for health check
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy built application from builder
COPY --from=builder /app/apps/api/dist ./dist

# Display size of /app directory
RUN echo "=== /app Directory Size ===" && du -hs /app && echo "============================"

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=5s --timeout=10s \
  CMD curl http://0.0.0.0:${PORT}/health || exit 1

# Start the production server
CMD ["bun", "run", "dist/index.js"]
