#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
environment=${1:?Pass the protected environment file explicitly}
# Pass --split explicitly when the deployment uses compose.split.yaml.
case "${2:-}" in
  "") split=false ;;
  --split) split=true ;;
  *) printf '%s\n' 'Usage: update.sh <protected-env-file> [--split]' >&2; exit 1 ;;
esac
compose() {
  if [ "$split" = true ]; then
    docker compose --env-file "$environment" -f "$root/deploy/compose.yaml" -f "$root/deploy/compose.split.yaml" "$@"
  else
    docker compose --env-file "$environment" -f "$root/deploy/compose.yaml" "$@"
  fi
}
compose config --quiet
# Index-only foundation migrations are generated inside a transaction. Run them
# in a maintenance window so CREATE INDEX cannot stall the old API's writers.
previous_api=$(compose ps -q api)
previous_web=$(compose ps -q web)
previous_relay=
previous_worker=
if [ "$split" = true ]; then
  previous_relay=$(compose ps -a -q relay)
  previous_worker=$(compose ps -a -q worker)
fi
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
    if [ "$phase" = migrate ]; then
      if [ -n "$previous_api" ]; then
        compose start api || printf '%s\n' 'Unable to restart the previous API; follow deployment recovery documentation.' >&2
      fi
      if [ -n "$previous_relay" ]; then
        compose start relay || printf '%s\n' 'Unable to restart the previous Relay; follow deployment recovery documentation.' >&2
      fi
      if [ -n "$previous_worker" ]; then
        compose start worker || printf '%s\n' 'Unable to restart the previous worker; follow deployment recovery documentation.' >&2
      fi
    elif [ "$phase" = replace ]; then
      # Stop a failed first deployment too, rather than leaving it restarting.
      compose stop api web || true
      if [ "$split" = true ]; then compose stop relay worker || true; fi
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
capture_image relay "$previous_relay"
capture_image worker "$previous_worker"
capture_image web "$previous_web"
compose up -d postgres
phase=migrate
compose stop api
if [ "$split" = true ]; then compose stop relay worker; fi
compose run --rm migrate
phase=replace
if [ "$split" = true ]; then compose up -d --no-deps --wait relay worker; fi
compose up -d --no-deps --wait api
compose up -d --no-deps --wait web
phase=complete
