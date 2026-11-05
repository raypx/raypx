# syntax=docker/dockerfile:1
# Headless Go verification only; installed desktop acceptance runs on native CI.
FROM oven/bun:1.4.4 AS bun

FROM golang:1.27.3-bookworm AS modules
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV CGO_ENABLED=0 GOTOOLCHAIN=go1.27.3 GOFLAGS=-mod=readonly \
    GOMODCACHE=/go/pkg/mod GOCACHE=/root/.cache/go-build
WORKDIR /app/apps/desktop
COPY apps/desktop/go.mod apps/desktop/go.sum ./
RUN --mount=type=cache,id=raypx-desktop-gomod,target=/go/pkg/mod,sharing=locked \
    go mod download

FROM modules AS checks
COPY apps/desktop/package.json ./
COPY apps/desktop/internal/ ./internal/
COPY apps/desktop/tests/native/host/ ./tests/native/host/
COPY apps/desktop/scripts/native/mygo.ts apps/desktop/scripts/native/packager.ts \
    apps/desktop/scripts/native/prepare-cli.ts apps/desktop/scripts/native/signing.ts ./scripts/native/
RUN --mount=type=cache,id=raypx-desktop-gomod,target=/go/pkg/mod,sharing=locked \
    --mount=type=cache,id=raypx-desktop-go-build,target=/root/.cache/go-build,sharing=locked \
    bun scripts/native/mygo.ts check
