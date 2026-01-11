# Stage 1: Install Bun
FROM node:22-alpine AS bun-base
RUN apk add --no-cache curl
RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL="/root/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Stage 2: Builder
FROM bun-base AS builder
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
COPY packages ./packages

RUN bun install --frozen-lockfile

# Build app
COPY . .
RUN bun run build --filter=web

# Stage 3: Runner
FROM bun-base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/apps/web/dist ./dist
COPY --from=builder /app/apps/web/package.json ./

EXPOSE 3000

CMD ["bun", "run", "serve"]
