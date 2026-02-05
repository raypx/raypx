# Stage 1: Builder
FROM node:22-alpine AS builder

WORKDIR /app

ENV NODE_ENV=production

# Enable pnpm using Corepack
RUN corepack enable

# Copy source code (including .git for turbo caching)
COPY . .

# Install all dependencies (including devDependencies for build)
# --ignore-scripts skips prepare hook (lefthook install requires git hooks setup)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build the application
RUN pnpm turbo build --filter=tanstack...

# Stage 2: Runner
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install curl for health check
RUN apk add --no-cache curl

# Copy built application from builder
COPY --from=builder /app/apps/tanstack/.output .output

# Display size of /app directory
RUN echo "=== /app Directory Size ===" && du -hs /app && echo "============================"

# Expose the application port
EXPOSE 3000

# Start the production server
CMD ["node", ".output/server/index.mjs"]