# syntax=docker/dockerfile:1.7-labs

# Build stage
FROM oven/bun:1.4.2-alpine AS builder

# Set working directory
WORKDIR /app

# Copy workspace configuration
COPY package.json bun.lock* bunfig.toml ./
COPY .bun-version .node-version ./

# Copy all workspace packages
COPY packages/ packages/
COPY apps/ apps/

# Install dependencies (production only)
RUN bun install --frozen-lockfile --production

# Build all packages
RUN bun run build

# Production stage
FROM oven/bun:1.4.2-alpine AS runner

# Install SQLite (for better-sqlite3)
RUN apk add --no-cache sqlite

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S bun -u 1001

# Set working directory
WORKDIR /app

# Copy built files from builder
COPY --from=builder --chown=bun:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=bun:nodejs /app/packages ./packages
COPY --from=builder --chown=bun:nodejs /app/apps ./apps
COPY --from=builder --chown=bun:nodejs /app/package.json ./

# Create data directory for SQLite
RUN mkdir -p /app/data && chown -R bun:nodejs /app/data

# Switch to non-root user
USER bun

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

# Start application
CMD ["bun", "run", "start"]
