FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Skip lefthook install in Docker/CI (no .git directory)
ENV CI=true

# Enable corepack to use pnpm version from package.json
RUN corepack enable

# Copy package.json first to enable corepack to detect pnpm version
COPY package.json pnpm-lock.yaml* ./

# Trigger corepack to prepare pnpm from package.json (will use packageManager field)
# and print versions for debugging
RUN node --version && pnpm --version

# Copy the entire project for dependency installation
# This ensures all packages are available for resolution
COPY . .

# Install dependencies using lockfile
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Set CI environment variable for build process
ENV CI=true

# Note: .git directory is excluded by .dockerignore, so lastModified plugin
# will automatically fallback to filesystem time instead of git time.
# If you need git-based last modified dates in Docker builds, you can:
# 1. Build with: BUILDKIT_CONTEXT_KEEP_GIT_DIR=1 docker build -f Dockerfile.docs .
# 2. Or temporarily modify .dockerignore to allow .git for docs builds
# 3. Or copy .git explicitly before this stage (requires modifying .dockerignore)

# Enable corepack to use pnpm version from package.json
RUN corepack enable

# Copy over everything including dependencies from deps stage
COPY --from=deps /app ./

# pnpm is already prepared from deps stage via corepack

# Build the project using pnpm turbo (turbo is installed via pnpm)
# --filter=docs ensures dependencies are built first
RUN pnpm turbo build --filter=docs

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV CI=true

# Copy package.json and workspace config from builder
# node:22-alpine includes a 'node' user (UID 1000) by default
# COPY --from=builder --chown=node:node /app/package.json ./

# Copy the build output and node_modules
COPY --from=builder --chown=node:node /app/apps/docs/.output ./apps/docs/.output
# COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Copy packages source code (needed for workspace resolution at runtime)
# COPY --from=builder --chown=node:node /app/packages ./packages

# Copy scripts directory (workspace package)
# COPY --from=builder --chown=node:node /app/scripts ./scripts

# Switch to non-root user (node user is pre-created in node:22-alpine)
USER node

# Expose port
EXPOSE 3000

# Set environment variables
ENV PORT=3000

# Health check (optional - remove if /api/health doesn't exist)
# HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
#   CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Start the application
CMD ["node", "apps/docs/.output/server/index.mjs"]
