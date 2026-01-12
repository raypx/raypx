FROM oven/bun:1

WORKDIR /app

# Set build and production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy everything (monorepo structure)
COPY . .

# Install dependencies and build
RUN bun install --frozen-lockfile
RUN bun turbo build --filter=web...

# Expose the application port
EXPOSE 3000

# Start the production server
CMD ["bun", "run", "apps/web/.output/server/index.mjs"]
