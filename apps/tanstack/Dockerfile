# Use Node.js official image
FROM node:22-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# Set working directory
WORKDIR /app

# Dependencies installation stage
FROM base AS deps

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/tanstack/package.json ./apps/tanstack/
COPY packages ./packages

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build stage
FROM base AS builder

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/tanstack/node_modules ./apps/tanstack/node_modules
COPY --from=deps /app/packages ./packages

# Copy source code
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json turbo.json ./
COPY apps/tanstack ./apps/tanstack
COPY packages ./packages

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build application
WORKDIR /app
RUN pnpm --filter tanstack build

# Runtime stage
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/apps/tanstack/.next/standalone ./

# Copy static files to the correct location in standalone
COPY --from=builder --chown=nextjs:nodejs /app/apps/tanstack/.next/static ./apps/tanstack/.next/static

# Copy public files to the correct location in standalone
COPY --from=builder --chown=nextjs:nodejs /app/apps/tanstack/public ./apps/tanstack/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start application
CMD ["node", "apps/tanstack/server.js"]