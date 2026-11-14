#!/bin/sh
# Runs on the dedicated Linux Engine host before supervisor admission.
set -eu
: "${SANDBOX_NAMESPACE:?}" "${SANDBOX_LISTEN_ADDRESS:?}"
case "$SANDBOX_NAMESPACE" in ''|*[!a-z0-9_-]*) exit 1 ;; esac
case "$SANDBOX_LISTEN_ADDRESS" in 10.77.0.2) ;; *) echo 'Configure the WireGuard interface address in prepare-host.sh' >&2; exit 1 ;; esac
export DOCKER_HOST=unix:///var/run/docker.sock
bridge="rpx$(printf %s "$SANDBOX_NAMESPACE" | sha256sum | cut -c1-10)"
network="$SANDBOX_NAMESPACE-computers"
if ! docker network inspect "$network" >/dev/null 2>&1; then
  docker network create --driver bridge \
    --opt "com.docker.network.bridge.name=$bridge" \
    --opt com.docker.network.bridge.enable_icc=false \
    --label "raypx.supervisor=$network" "$network" >/dev/null
fi
# Refuse a colliding network before applying any firewall rules.
[ "$(docker network inspect --format '{{.Driver}}' "$network")" = bridge ]
[ "$(docker network inspect --format '{{index .Labels "raypx.supervisor"}}' "$network")" = "$network" ]
[ "$(docker network inspect --format '{{index .Options "com.docker.network.bridge.name"}}' "$network")" = "$bridge" ]
[ "$(docker network inspect --format '{{index .Options "com.docker.network.bridge.enable_icc"}}' "$network")" = false ]
# The private listener accepts only the authenticated WireGuard peer.
# Do not flush/reorder unrelated host rules. Insert the deny first, then allow.
iptables -w -C INPUT -p tcp --dport 4020 -m comment --comment raypx-control-deny -j DROP 2>/dev/null || \
  iptables -w -I INPUT 1 -p tcp --dport 4020 -m comment --comment raypx-control-deny -j DROP
iptables -w -C INPUT -i raypx-control -s 10.77.0.1/32 -d 10.77.0.2/32 -p tcp --dport 4020 -m comment --comment raypx-control-allow -j ACCEPT 2>/dev/null || \
  iptables -w -I INPUT 1 -i raypx-control -s 10.77.0.1/32 -d 10.77.0.2/32 -p tcp --dport 4020 -m comment --comment raypx-control-allow -j ACCEPT
# Apply tenant hooks last so they remain first in INPUT across repeated starts.
sh /opt/raypx-sandbox/current/egress.sh --bridge "$bridge" \
  --resolver "${SANDBOX_DNS_RESOLVER:-1.1.1.1}" --apply
