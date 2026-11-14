#!/bin/sh
# Linux Docker iptables backend only. Run on the Engine host, never in a computer.
set -efu

usage() {
  echo 'Usage: egress.sh --bridge rpx<10 lowercase hex digits> [--resolver public-IPv4] --dry-run|--apply|--remove' >&2
  exit 2
}

bridge=
mode=
resolver=1.1.1.1
resolver_set=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --bridge)
      [ "$#" -ge 2 ] || usage
      [ -z "$bridge" ] || usage
      bridge=$2
      shift 2
      ;;
    --dry-run|--apply|--remove)
      [ -z "$mode" ] || usage
      mode=$1
      shift
      ;;
    --resolver)
      [ "$#" -ge 2 ] || usage
      [ "$resolver_set" = false ] || usage
      resolver=$2
      resolver_set=true
      shift 2
      ;;
    *) usage ;;
  esac
done
[ -n "$mode" ] || usage
# This is the bridge derived from SANDBOX_NAMESPACE, not an arbitrary interface.
case "$bridge" in rpx??????????) ;; *) usage ;; esac
suffix=${bridge#rpx}
case "$suffix" in *[!0-9a-f]*) usage ;; esac
chain=RPX_E_$suffix
tag=raypx-sandbox-egress:$bridge
# No DNS lookup, shell evaluation or alternate address spelling reaches iptables.
case "$resolver" in *[!0-9.]*|''|.*|*.) usage ;; esac
saved_ifs=$IFS
IFS=.
set -- $resolver
IFS=$saved_ifs
[ "$#" -eq 4 ] || usage
for octet do
  case "$octet" in ''|0[0-9]*) usage ;; esac
  [ "${#octet}" -le 3 ] && [ "$octet" -le 255 ] || usage
done
case "$1.$2.$3" in
  0.*|10.*|127.*|169.254.*|192.0.0|192.0.2|192.168.*|198.18.*|198.19.*|198.51.100|203.0.113) usage ;;
esac
[ "$1" -lt 224 ] || usage
if [ "$1" -eq 100 ] && [ "$2" -ge 64 ] && [ "$2" -le 127 ]; then usage; fi
if [ "$1" -eq 172 ] && [ "$2" -ge 16 ] && [ "$2" -le 31 ]; then usage; fi
dns_tag=raypx-sandbox-dns:$bridge:$resolver
created_chain=false
added_hooks=
# Include non-public special-use destinations, CGNAT, benchmarks and multicast.
blocked='0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4'

# Dry-run, preflight, apply and rollback visit the same rules. Hooks are last, so
# first apply never routes traffic through an incompletely populated owned chain.
policy() {
  policy_visitor=$1
  for destination in $blocked; do
    "$policy_visitor" append iptables "$chain" -d "$destination" -m comment --comment "$tag" -j DROP
    # DOCKER-USER sees packets after DNAT. Also reject a private original destination.
    "$policy_visitor" append iptables "$chain" -m conntrack --ctorigdst "$destination" -m comment --comment "$tag" -j DROP
  done
  # Engine's embedded DNS is configured separately with the same sole upstream.
  # Direct DNS may use that resolver only, including TCP fallback and pre-DNAT destinations.
  for protocol in udp tcp; do
    "$policy_visitor" append iptables "$chain" -p "$protocol" ! -d "$resolver" --dport 53 -m comment --comment "$dns_tag" -j DROP
    "$policy_visitor" append iptables "$chain" -p "$protocol" -m conntrack ! --ctorigdst "$resolver" --ctorigdstport 53 -m comment --comment "$dns_tag" -j DROP
  done
  # INPUT blocks the Docker host regardless of the address used to reach it.
  "$policy_visitor" hook iptables INPUT -i "$bridge" -m comment --comment "$tag" -j DROP
  # Public internet egress is IPv4 only; deny IPv6 rather than leak it.
  "$policy_visitor" hook ip6tables INPUT -i "$bridge" -m comment --comment "$tag" -j DROP
  "$policy_visitor" hook ip6tables FORWARD -i "$bridge" -m comment --comment "$tag" -j DROP
  "$policy_visitor" hook iptables DOCKER-USER -i "$bridge" -m comment --comment "$tag" -j "$chain"
}

render_rule() {
  render_kind=$1
  render_binary=$2
  render_chain=$3
  shift 3
  if [ "$render_kind" = hook ]; then
    echo "$render_binary -w -I $render_chain 1 $*"
  else
    echo "$render_binary -w -A $render_chain $*"
  fi
}

if [ "$mode" = --dry-run ]; then
  echo "# Engine host only; Docker must use the iptables backend. Owned bridge: $bridge; DNS: $resolver"
  echo '# Idempotent apply adds absent rules; existing hooks must remain first or apply refuses.'
  echo "iptables -w -N $chain"
  policy render_rule
  echo '# IPv4 public destinations return to Docker policy; all bridge IPv6 is denied.'
  exit 0
fi

[ "$(uname -s)" = Linux ] || { echo 'egress.sh requires the Linux Docker Engine host' >&2; exit 1; }
for binary in iptables ip6tables; do
  command -v "$binary" >/dev/null 2>&1 || { echo "egress.sh requires $binary" >&2; exit 1; }
done
[ "$(id -u)" = 0 ] || { echo 'egress.sh requires root on the Engine host' >&2; exit 1; }

owned_chain() {
  iptables -w -C "$chain" -d 0.0.0.0/8 -m comment --comment "$tag" -j DROP 2>/dev/null
}

remove_rule() {
  remove_binary=$1
  remove_chain=$2
  shift 2
  while "$remove_binary" -w -C "$remove_chain" "$@" 2>/dev/null; do
    "$remove_binary" -w -D "$remove_chain" "$@"
  done
}

remove_hook() {
  [ "$1" = hook ] || return 0
  shift
  remove_rule "$@"
}

remove_rules() {
  # Do not flush a chain whose ownership marker is missing.
  if iptables -w -S "$chain" >/dev/null 2>&1; then
    if [ "$created_chain" != true ]; then
      owned_chain || { echo 'Refusing to remove an unowned firewall chain' >&2; return 1; }
    fi
  fi
  policy remove_hook
  if [ "$created_chain" = true ] || owned_chain; then
    iptables -w -F "$chain"
    iptables -w -X "$chain"
  fi
}

if [ "$mode" = --remove ]; then
  # A stopped supervisor may already have removed the bridge.
  remove_rules
  exit 0
fi

# A Unix socket can proxy an Engine inside Docker Desktop or a rootless namespace.
# Never claim host policy or mutate the caller's firewall when its bridge is elsewhere.
[ -d "/sys/class/net/$bridge/bridge" ] || {
  echo 'Computer bridge is absent from this host network namespace; run on the Engine host' >&2
  exit 1
}
# Refuse native nftables Docker networking: its hooks do not provide DOCKER-USER.
iptables -w -S DOCKER-USER >/dev/null 2>&1 || {
  echo 'Docker DOCKER-USER chain is unavailable; use the Docker iptables backend' >&2
  exit 1
}
if iptables -w -S "$chain" >/dev/null 2>&1; then
  owned_chain || { echo 'Refusing to modify an unowned firewall chain' >&2; exit 1; }
  existing_rules=$(iptables -w -S "$chain")
  case "$existing_rules" in
    *raypx-sandbox-dns:*)
      iptables -w -C "$chain" -p udp ! -d "$resolver" --dport 53 -m comment --comment "$dns_tag" -j DROP 2>/dev/null || {
        echo 'DNS resolver changed; remove the previous rules before applying the new resolver' >&2
        exit 1
      }
      ;;
  esac
fi

check_hook() {
  [ "$1" = hook ] || return 0
  check_binary=$2
  check_chain=$3
  shift 3
  # An existing hook must still have priority. Refusing preserves policy without
  # opening a transient gap by removing and reinserting live firewall hooks.
  if ! "$check_binary" -w -C "$check_chain" "$@" 2>/dev/null; then
    return 0
  fi
  check_rules=$("$check_binary" -w -S "$check_chain")
  check_first=
  while IFS= read -r check_line; do
    case "$check_line" in
      "-A $check_chain "*) check_first=$check_line; break ;;
    esac
  done <<RULES
$check_rules
RULES
  # iptables may quote comments in -S output. No eval or glob expansion is used.
  check_normalized=
  for check_word in $check_first; do
    check_word=${check_word#\"}
    check_word=${check_word%\"}
    check_normalized="$check_normalized $check_word"
  done
  [ "${check_normalized# }" = "-A $check_chain $*" ] || {
    echo "Existing sandbox hook is not first in $check_binary $check_chain; reconcile host policy before applying" >&2
    return 1
  }
}

# Validate every existing hook before making any change.
policy check_hook

apply_rule() {
  apply_kind=$1
  apply_binary=$2
  apply_chain=$3
  shift 3
  if "$apply_binary" -w -C "$apply_chain" "$@" 2>/dev/null; then
    return 0
  fi
  if [ "$apply_kind" = hook ]; then
    added_hooks="$added_hooks $apply_binary:$apply_chain"
    "$apply_binary" -w -I "$apply_chain" 1 "$@"
  else
    "$apply_binary" -w -A "$apply_chain" "$@"
  fi
}

rollback_hook() {
  [ "$1" = hook ] || return 0
  rollback_key=$2:$3
  shift
  case " $added_hooks " in
    *" $rollback_key "*) remove_rule "$@" ;;
  esac
}

rollback_new_chain() {
  # Failed reapply retains all prior protections. First apply removes only hooks
  # added by this invocation; pre-existing host protection is never rolled back.
  [ "$created_chain" = true ] || return 0
  policy rollback_hook
  iptables -w -F "$chain"
  iptables -w -X "$chain"
}

trap 'status=$?; if [ "$status" -ne 0 ]; then rollback_new_chain; fi' 0
trap 'exit 130' INT
trap 'exit 143' TERM
if ! iptables -w -S "$chain" >/dev/null 2>&1; then
  iptables -w -N "$chain"
  created_chain=true
fi
policy apply_rule
