# shellcheck shell=bash
# Renders /etc/wireguard/wg0.conf. Sourced by bootstrap.sh (and by scripts/deploy-host.test.ts)
# after wg-common.sh. Functions only; sourcing this file changes nothing.

# render_wireguard_conf <role> <address/prefix> <listen port or ''> <private key> <WG_PEERS value>
# Prints the wg-quick configuration, or prints nothing and returns 1 (reason on stderr) when any
# input is malformed, so the caller never writes a half-checked file.
#   app role      dials out: every peer needs an endpoint and gets PersistentKeepalive 25, which also
#                 keeps the NAT mapping of a Lightsail host open. No ListenPort.
#   lavalink role listens on <listen port>; peers need no endpoint (the app hosts dial in).
render_wireguard_conf() {
  local role=$1 address=$2 listen_port=$3 private_key=$4 peers_raw=$5
  local peers key allowed endpoint n=0
  case $role in
    app | lavalink) ;;
    *)
      printf 'unknown role "%s"\n' "$role" >&2
      return 1
      ;;
  esac
  if ! wg_valid_address "$address"; then
    printf 'WG_ADDRESS "%s" is not an IPv4 address with a prefix length, like 10.77.0.1/24\n' "$address" >&2
    return 1
  fi
  if [[ $role == lavalink ]] && ! wg_valid_port "$listen_port"; then
    printf 'WG_LISTEN_PORT "%s" is not a port number\n' "$listen_port" >&2
    return 1
  fi
  if ! wg_valid_key "$private_key"; then
    printf 'the WireGuard private key is not 44 characters of base64\n' >&2
    return 1
  fi
  peers=$(wg_normalize_peers "$peers_raw") || {
    printf 'WG_PEERS is invalid\n' >&2
    return 1
  }
  if [[ $role == app ]]; then
    while read -r _ allowed endpoint _; do
      n=$((n + 1))
      if [[ $endpoint == - ]]; then
        printf 'WG_PEERS: peer %d (%s) needs an endpoint host:port, because the app role dials out\n' "$n" "$allowed" >&2
        return 1
      fi
    done <<<"$peers"
  fi

  printf '# Managed by deploy/host/bootstrap.sh (Ririko). Edit /etc/ririko/ririko.conf and run it again.\n'
  printf '[Interface]\n'
  printf 'Address = %s\n' "$address"
  if [[ $role == lavalink ]]; then
    printf 'ListenPort = %s\n' "$listen_port"
  fi
  printf 'PrivateKey = %s\n' "$private_key"
  while read -r key allowed endpoint _; do
    printf '\n[Peer]\n'
    printf 'PublicKey = %s\n' "$key"
    printf 'AllowedIPs = %s\n' "$allowed"
    if [[ $endpoint != - ]]; then
      printf 'Endpoint = %s\n' "$endpoint"
    fi
    if [[ $role == app ]]; then
      printf 'PersistentKeepalive = 25\n'
    fi
  done <<<"$peers"
}
