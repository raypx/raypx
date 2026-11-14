#!/bin/sh
# Independent host containment; never repair policy while admitting tenants.
set -eu
: "${SANDBOX_NAMESPACE:?}"
case "$SANDBOX_NAMESPACE" in ''|*[!a-z0-9_-]*) exit 1 ;; esac
systemctl is-active --quiet raypx-sandbox.service || exit 0
bridge="rpx$(printf %s "$SANDBOX_NAMESPACE" | sha256sum | cut -c1-10)"
tag="raypx-sandbox-egress:$bridge"
healthy=true
iptables -w -C INPUT -i "$bridge" -m comment --comment "$tag" -j DROP 2>/dev/null || healthy=false
ip6tables -w -C INPUT -i "$bridge" -m comment --comment "$tag" -j DROP 2>/dev/null || healthy=false
ip6tables -w -C FORWARD -i "$bridge" -m comment --comment "$tag" -j DROP 2>/dev/null || healthy=false
iptables -w -C DOCKER-USER -i "$bridge" -m comment --comment "$tag" -j "RPX_E_${bridge#rpx}" 2>/dev/null || healthy=false
# Measured storage needs a host-level overshoot reserve as well as per-home limits.
for path in /var/lib/docker /var/lib/raypx-sandbox /var/lib/raypx-sandbox-network; do
  used=$(df -P "$path" | awk 'NR==2 { gsub(/%/, "", $5); print $5 }')
  inodes=$(df -Pi "$path" | awk 'NR==2 { gsub(/%/, "", $5); print $5 }')
  [ "$used" -lt 85 ] && [ "$inodes" -lt 90 ] || healthy=false
done
if [ "$healthy" != true ]; then
  echo '{"event":"sandbox.host_policy_refused"}' >&2
  "$(dirname "$0")/stop-owned.sh" || true
  systemctl stop raypx-sandbox.service
  exit 1
fi
