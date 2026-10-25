#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
environment=${1:?Pass the protected environment file explicitly}
compose() { docker compose --env-file "$environment" -f "$root/deploy/compose.yaml" "$@"; }
compose config --quiet
# Index-only foundation migrations are generated inside a transaction. Run them
# in a maintenance window so CREATE INDEX cannot stall the old API's writers.
previous_api=$(compose ps -q api)
previous_web=$(compose ps -q web)
rollback=$(mktemp "${TMPDIR:-/tmp}/raypx-rollback.XXXXXXXX")
phase=prepare
restore_services=
capture_image() {
  service=$1
  container=$2
  if [ -n "$container" ]; then
    image=$(docker inspect --format '{{.Image}}' "$container")
    if ! printf '%s\n' "$image" | LC_ALL=C grep -Eq '^sha256:[0-9a-f]{64}$'; then
      printf '%s\n' "Invalid previous image identity for $service" >&2
      return 1
    fi
    printf '  %s:\n    image: "%s"\n' "$service" "$image" >> "$rollback"
    restore_services="$restore_services $service"
  fi
}
finish() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "$status" -ne 0 ]; then
    if [ "$phase" = migrate ] && [ -n "$previous_api" ]; then
      compose start api || printf '%s\n' 'Unable to restart the previous API; follow deployment recovery documentation.' >&2
    elif [ "$phase" = replace ]; then
      # Stop a failed first deployment too, rather than leaving it restarting.
      compose stop api web || true
      if [ -n "$restore_services" ]; then
        # Deliberately split only the fixed service names captured above.
        # shellcheck disable=SC2086
        compose -f "$rollback" up -d --no-deps --wait $restore_services || printf '%s\n' 'Image rollback failed; follow deployment recovery documentation.' >&2
      fi
    fi
  fi
  rm -f "$rollback"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM
printf 'services:\n' > "$rollback"
capture_image api "$previous_api"
capture_image web "$previous_web"
compose up -d postgres
phase=migrate
compose stop api
compose run --rm migrate
phase=replace
compose up -d --no-deps --wait api
compose up -d --no-deps --wait web
phase=complete
