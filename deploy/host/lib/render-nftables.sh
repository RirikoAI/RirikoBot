# shellcheck shell=bash
# Renders the firewall of the Lavalink host: nftables table "inet ririko". Sourced by bootstrap.sh
# (and by scripts/deploy-host.test.ts) after wg-common.sh. Functions only; sourcing this file
# changes nothing.

# The WireGuard interface the peers arrive on (/etc/wireguard/wg0.conf).
WG_INTERFACE=wg0

# render_nftables <WireGuard listen port> <WG_ALLOWED_ENDPOINTS value> <WG_PEERS value>
# Prints the rule file, or prints nothing and returns 1 (reason on stderr) when any input is
# malformed. WG_ALLOWED_ENDPOINTS is a list of IPv4 and IPv6 addresses (with an optional prefix
# length), separated by spaces or commas: the public addresses the peers' handshakes come from.
# Each peer in WG_PEERS with a ports field may open TCP connections to exactly those ports, over
# WireGuard, from its own tunnel address.
#
# Rules: input policy drop; loopback; invalid dropped, established and related accepted; ICMP echo
# rate limited, plus the IPv6 neighbour discovery messages; UDP <port> from the allowed endpoints;
# the per-peer Lavalink ports. Output is not filtered. The file declares its table first and then
# deletes and re-creates only that table, in one transaction: it never flushes the ruleset, which
# would remove Docker's own tables.
render_nftables() {
  local listen_port=$1 endpoints_raw=$2 peers_raw=$3
  local source family peers allowed ports sources4='' sources6='' rules='' n=0
  local -a sources
  if ! wg_valid_port "$listen_port"; then
    printf 'WG_LISTEN_PORT "%s" is not a port number\n' "$listen_port" >&2
    return 1
  fi
  read -r -a sources <<<"${endpoints_raw//,/ }"
  if ((${#sources[@]} == 0)); then
    printf 'WG_ALLOWED_ENDPOINTS is empty: nobody could complete a WireGuard handshake\n' >&2
    return 1
  fi
  for source in "${sources[@]}"; do
    if ! family=$(wg_source_family "$source"); then
      printf 'WG_ALLOWED_ENDPOINTS: "%s" is not an IPv4 or IPv6 address\n' "$source" >&2
      return 1
    fi
    if [[ $family == 4 ]]; then
      sources4+="${sources4:+, }$source"
    else
      sources6+="${sources6:+, }$source"
    fi
  done
  peers=$(wg_normalize_peers "$peers_raw") || {
    printf 'WG_PEERS is invalid\n' >&2
    return 1
  }
  while read -r _ allowed _ ports; do
    [[ $ports != - ]] || continue
    n=$((n + 1))
    rules+="    iifname \"$WG_INTERFACE\" ip saddr ${allowed%/32} tcp dport { ${ports//,/, } } accept"$'\n'
  done <<<"$peers"
  if ((n == 0)); then
    printf 'WG_PEERS: no peer has a ports field, so no peer could reach Lavalink\n' >&2
    return 1
  fi

  cat <<'NFT'
# Managed by deploy/host/bootstrap.sh (Ririko). Edit /etc/ririko/ririko.conf and run it again.
# The first line declares the table so the delete cannot fail on a host that never had it. The
# file loads as one transaction and touches no other table (Docker's rules stay).
table inet ririko
delete table inet ririko

table inet ririko {
  chain input {
    type filter hook input priority filter; policy drop;

    ct state invalid drop
    ct state established,related accept
    iifname "lo" accept

    # Ping, rate limited, and the IPv6 messages without which the network stops working.
    icmp type echo-request limit rate 5/second burst 10 packets accept
    icmpv6 type echo-request limit rate 5/second burst 10 packets accept
    icmpv6 type { nd-router-solicit, nd-router-advert, nd-neighbor-solicit, nd-neighbor-advert } accept

    # WireGuard handshakes, only from the app hosts' public addresses.
NFT
  if [[ -n $sources4 ]]; then
    printf '    ip saddr { %s } udp dport %s accept\n' "$sources4" "$listen_port"
  fi
  if [[ -n $sources6 ]]; then
    printf '    ip6 saddr { %s } udp dport %s accept\n' "$sources6" "$listen_port"
  fi
  printf '\n    # Lavalink, over WireGuard only: each peer reaches its own ports from its own address.\n'
  printf '%s' "$rules"
  printf '  }\n}\n'
}
