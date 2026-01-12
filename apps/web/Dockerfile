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
RUN bun turbo build --filter=web...

# Stage 2: Runner
FROM oven/bun:1 AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy built application from builder
COPY --from=builder /app/apps/web/.output .output

# Expose the application port
EXPOSE 3000

# Start the production server
CMD ["bun", "run", ".output/server/index.mjs"]
