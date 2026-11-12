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

# Deployment smoke shares the original Dockerfiles with Railway in one builder.
# Compose hosts add a local Bun download cache to a temporary copy.
dockerfile=
if [ "${RAYPX_BUILD_INSTALL_CACHE_MOUNTS:-1}" != 0 ]; then
  dockerfile=$(mktemp "${TMPDIR:-/tmp}/raypx-dockerfile.XXXXXX")
  trap 'rm -f "$dockerfile"' EXIT
fi
build_dockerfile() {
  if [ -z "$dockerfile" ]; then
    printf '%s\n' "$1"
    return
  fi
  awk '
    /^RUN (VP_GIT_HOOKS=0 )?bun install / {
      sub(/^RUN /, "RUN --mount=type=cache,id=raypx-bun-install,target=/root/.bun/install/cache,sharing=locked ")
    }
    { print }
  ' "$1" > "$dockerfile"
  printf '%s\n' "$dockerfile"
}

# Run image builds sequentially; the container builder owns the CPU/memory budget.
# Compose and Railway share the application Dockerfiles. Identical dependency stages mean
# the later builds reuse the first install unless package manifests or bun.lock change.
api_dockerfile=$(build_dockerfile apps/api/Dockerfile)
docker buildx build --builder "$builder" --load \
  --file "$api_dockerfile" --target migrate \
  --build-arg "VITE_APP_RELEASE=$release" \
  --tag "raypx/api-migrate:$release" .
docker buildx build --builder "$builder" --load \
  --file "$api_dockerfile" --target runtime \
  --build-arg "VITE_APP_RELEASE=$release" \
  --tag "raypx/api:$release" .
web_dockerfile=$(build_dockerfile apps/web/Dockerfile)
docker buildx build --builder "$builder" --load \
  --file "$web_dockerfile" --target runtime \
  --build-arg "VITE_API_URL=https://$APP_HOST" \
  --build-arg "VITE_APP_RELEASE=$release" \
  --tag "raypx/web:$release" .
