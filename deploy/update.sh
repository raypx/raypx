#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
environment=${1:?Pass the protected environment file explicitly}
compose() { docker compose --env-file "$environment" -f "$root/deploy/compose.yaml" "$@"; }
# Nothing is replaced until the isolated environment's migration succeeds.
compose config --quiet
compose up -d postgres
compose run --rm migrate
compose up -d --no-deps --wait api
compose up -d --no-deps --wait web
