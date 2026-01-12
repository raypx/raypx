# Stage 1: Builder
FROM oven/bun:1 AS builder

WORKDIR /app

ENV NODE_ENV=production

# Copy source code
# This layer is invalidated when source code changes
COPY . .

# Install all dependencies (including devDependencies for build)
# This layer is cached unless dependencies change
RUN bun install --frozen-lockfile

# Build the application
RUN bun turbo build --filter=web...

# Stage 2: Runner
FROM oven/bun:1 AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy built application from builder
# Note: Only copying the built output, no need for source code or dependencies
# Copy .env file if it exists (Docker COPY doesn't support --if-present, so we use RUN)
COPY --from=builder /app/apps/web/.env .env
COPY --from=builder /app/apps/web/.output .output

# Expose the application port
EXPOSE 3000

# Start the production server
CMD ["bun", "run", ".output/server/index.mjs"]