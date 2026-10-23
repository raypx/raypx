#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"
: "${BETA_HOST:?Set the beta hostname before building}"
: "${RAYPX_RELEASE:?Set a unique image release before building}"
builder=${RAYPX_BUILD_BUILDER:-raypx-beta-builder}

# Run image builds sequentially; the container builder owns the CPU/memory budget.
docker buildx build --builder "$builder" --load \
  --file apps/api/Dockerfile --target migrate \
  --build-arg "VITE_APP_RELEASE=$RAYPX_RELEASE" \
  --tag "raypx/api-migrate:$RAYPX_RELEASE" .
docker buildx build --builder "$builder" --load \
  --file apps/api/Dockerfile --target runtime \
  --build-arg "VITE_APP_RELEASE=$RAYPX_RELEASE" \
  --tag "raypx/api:$RAYPX_RELEASE" .
docker buildx build --builder "$builder" --load \
  --file apps/web/Dockerfile \
  --build-arg "VITE_API_URL=https://$BETA_HOST" \
  --build-arg "VITE_APP_RELEASE=$RAYPX_RELEASE" \
  --tag "raypx/web:$RAYPX_RELEASE" .
