#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
: "${COMPOSE_PROJECT_NAME:?Set the Compose project name}"
: "${APP_HOST:?Set the application hostname before building}"
: "${RAYPX_RELEASE:?Set a unique image release before building}"
case "$COMPOSE_PROJECT_NAME" in
  [!a-z0-9]*|*[!a-z0-9_-]*) echo "COMPOSE_PROJECT_NAME must start with a lowercase letter or digit and use lowercase letters, digits, hyphens or underscores" >&2; exit 1 ;;
esac
case "$APP_HOST" in
  *[!a-zA-Z0-9.-]*) echo "APP_HOST must be a hostname without a URL scheme, path or port" >&2; exit 1 ;;
esac
builder=${RAYPX_BUILD_BUILDER:-raypx-builder}
release=$COMPOSE_PROJECT_NAME-$RAYPX_RELEASE
case "$RAYPX_RELEASE" in
  [!a-zA-Z0-9_]*|*[!a-zA-Z0-9_.-]*) echo "RAYPX_RELEASE must be a valid image tag component" >&2; exit 1 ;;
esac
if [ "${#release}" -gt 128 ]; then
  echo "The project-prefixed image tag exceeds 128 characters" >&2
  exit 1
fi

if ! docker buildx inspect "$builder" >/dev/null 2>&1; then
  docker buildx create --name "$builder" --driver docker-container \
    --driver-opt "memory=${BUILD_MEMORY:-3g}" \
    --driver-opt "memory-swap=${BUILD_MEMORY_SWAP:-4g}" \
    --driver-opt "cpu-quota=${BUILD_CPU_QUOTA:-200000}" --driver-opt cpu-period=100000
fi

# Railway reads the same Dockerfiles but requires service-specific cache mount IDs.
# Add local cache mounts only for Compose; keep all build commands in apps/.
dockerfile=$(mktemp "${TMPDIR:-/tmp}/raypx-dockerfile.XXXXXX")
trap 'rm -f "$dockerfile"' EXIT
cached_dockerfile() {
  awk '
    /^RUN (VP_GIT_HOOKS=0 )?bun install / {
      sub(/^RUN /, "RUN --mount=type=cache,id=raypx-bun-install,target=/root/.bun/install/cache,sharing=locked ")
    }
    /^RUN bun run build:/ {
      sub(/^RUN /, "RUN --mount=type=cache,id=raypx-vp,target=/app/node_modules/.vite/task-cache,sharing=locked ")
    }
    { print }
  ' "$1" > "$dockerfile"
}

# Run image builds sequentially; the container builder owns the CPU/memory budget.
# The API and Web Dockerfiles share identical manifest and dependency stages, so
# the later builds reuse the first install unless package manifests or bun.lock change.
cached_dockerfile apps/api/Dockerfile
docker buildx build --builder "$builder" --load \
  --file "$dockerfile" --target migrate \
  --build-arg "VITE_APP_RELEASE=$release" \
  --tag "raypx/api-migrate:$release" .
docker buildx build --builder "$builder" --load \
  --file "$dockerfile" --target runtime \
  --build-arg "VITE_APP_RELEASE=$release" \
  --tag "raypx/api:$release" .
cached_dockerfile apps/web/Dockerfile
docker buildx build --builder "$builder" --load \
  --file "$dockerfile" --target runtime \
  --build-arg "VITE_API_URL=https://$APP_HOST" \
  --build-arg "VITE_APP_RELEASE=$release" \
  --tag "raypx/web:$release" .
