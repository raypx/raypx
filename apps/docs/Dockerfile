# Use Node.js official image
FROM node:22-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# Set working directory
WORKDIR /app

# Disable lefthook during install (CI=true makes lefthook skip hook installation)
# LEFTHOOK=0 provides additional safeguard
# These env vars will be inherited by all stages that use FROM base
ENV LEFTHOOK=0
ENV CI=true

# Production environment variables (inherited by builder and runner stages)
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Dependencies installation stage
FROM base AS deps

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/docs/.env ./
COPY apps/docs/package.json ./apps/docs/
COPY packages ./packages

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/docs/node_modules ./apps/docs/node_modules
COPY --from=deps /app/packages ./packages

# Copy source code
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json turbo.json ./
COPY apps/docs ./apps/docs
COPY packages ./packages

# Build application
WORKDIR /app
RUN pnpm --filter docs build

# Runtime stage
FROM base AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/apps/docs/.next/standalone ./

# Copy static files to the correct location in standalone
COPY --from=builder --chown=nextjs:nodejs /app/apps/docs/.next/static ./apps/docs/.next/static

# Copy public files to the correct location in standalone
COPY --from=builder --chown=nextjs:nodejs /app/apps/docs/public ./apps/docs/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start application
CMD ["node", "apps/docs/server.js"]
