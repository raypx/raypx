#!/bin/sh
# Contain owned tenant processes when the supervisor exits or crashes.
set -eu
: "${SANDBOX_NAMESPACE:?}"
case "$SANDBOX_NAMESPACE" in ''|*[!a-z0-9_-]*) exit 1 ;; esac
export DOCKER_HOST=unix:///var/run/docker.sock
owner="$SANDBOX_NAMESPACE-computers"
for id in $(timeout 20 docker ps --quiet --filter "label=raypx.supervisor=$owner" --filter label=raypx.role=computer); do
  [ "$(docker inspect --format '{{index .Config.Labels "raypx.supervisor"}}' "$id")" = "$owner" ] || exit 1
  if [ "$(docker inspect --format '{{.State.Paused}}' "$id")" = true ]; then
    timeout 20 docker unpause "$id" >/dev/null
  fi
  timeout 20 docker stop --time 0 "$id" >/dev/null
done
