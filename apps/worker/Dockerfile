# syntax=docker/dockerfile:1
FROM node:24.18.0-bookworm-slim AS tools
COPY --from=oven/bun:1.4.0 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

FROM tools AS prune
COPY . .
RUN turbo_version=$(node -p "require('./package.json').workspaces.catalogs.tooling.turbo") && \
    bun x "turbo@$turbo_version" prune @voidmix/worker --docker

FROM tools AS build
COPY --from=prune /app/out/json/ ./
# Turbo 2.11.7 omits some optional-peer devDependency resolutions from Bun
# pruned locks. Keep the canonical lock; Bun skips excluded workspaces.
COPY bun.lock ./
# Root postinstall needs shared sources, which arrive in the next layer.
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=prune /app/out/full/ ./
COPY tsconfig.json test.config.ts vite.config.ts turbo.json .gitignore .prettierignore ./
RUN bun run postinstall
RUN bun run build:worker

FROM node:24.18.0-bookworm-slim AS runtime
# A dated Debian snapshot freezes LibreOffice, its dependencies and Chinese fonts.
ARG DEBIAN_SNAPSHOT=20261001T000000Z
RUN rm -f /etc/apt/sources.list.d/debian.sources && \
    printf 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/%s bookworm main\ndeb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/%s bookworm-security main\n' "$DEBIAN_SNAPSHOT" "$DEBIAN_SNAPSHOT" > /etc/apt/sources.list && \
    apt-get update && apt-get install -y --no-install-recommends libreoffice-impress poppler-utils fonts-noto-cjk ca-certificates && \
    rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    SOFFICE_BINARY=/usr/bin/libreoffice \
    CLOUD_PDF_FONT_PATH=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc \
    CLOUD_PDF_FONT_FAMILY=NotoSansCJKsc-Regular
WORKDIR /app/apps/worker
COPY --chown=node:node --from=build /app/apps/worker/dist ./dist
USER node
RUN node dist/index.mjs --check
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
