FROM oven/bun:1

WORKDIR /app

# Set build and production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy everything (monorepo structure)
COPY . .

# Install dependencies (postinstall scripts will run automatically)
RUN bun install --frozen-lockfile
RUN bun turbo build --filter=docs...

# Expose the application port
EXPOSE 3000

# Start the production server
CMD ["bun", "run", "apps/docs/.output/server/index.mjs"]