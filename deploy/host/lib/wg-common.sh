# shellcheck shell=bash
# Validation and config helpers shared by render-wireguard.sh and render-nftables.sh, sourced by
# bootstrap.sh (and by scripts/deploy-host.test.ts). Functions only: sourcing this file changes
# nothing. Nothing here exits the shell; a function that refuses its input prints the reason to
# stderr and returns 1, so the caller decides what to do.

# WG_PEERS holds one peer per entry, entries separated by ';' (or newlines), fields by spaces:
#   <public key> <allowed ip>/32 [<endpoint host:port> | -] [<tcp ports, comma separated> | -]
# - endpoint: where this host dials the peer (the app role needs one; the VPS side may omit it)
# - ports: Lavalink ports the peer may reach on this host's WireGuard address (lavalink role)
# Example: WG_PEERS="KEY1 10.77.0.2/32 - 2333; KEY2 10.77.0.3/32 - 2334"

# A WireGuard key is 32 bytes in base64: 43 characters and "=", where the last character before
# the "=" only carries 4 bits.
wg_valid_key() {
  [[ $1 =~ ^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$ ]]
}

wg_valid_ipv4() {
  local octet
  local -a octets
  [[ $1 =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1
  IFS=. read -r -a octets <<<"$1"
  for octet in "${octets[@]}"; do
    # No leading zeros (some tools read them as octal) and at most 255.
    [[ $octet == 0 || $octet =~ ^[1-9][0-9]*$ ]] || return 1
    ((octet <= 255)) || return 1
  done
}

wg_valid_ipv6() {
  local head tail part group count=0
  local -a groups
  [[ $1 =~ ^[0-9A-Fa-f:]+$ && $1 == *:*:* && $1 != *:::* ]] || return 1
  head=$1
  tail=''
  if [[ $1 == *::* ]]; then
    head=${1%%::*}
    tail=${1#*::}
    [[ $tail != *::* ]] || return 1
  fi
  for part in "$head" "$tail"; do
    [[ -n $part ]] || continue
    IFS=: read -r -a groups <<<"$part"
    for group in "${groups[@]}"; do
      [[ $group =~ ^[0-9A-Fa-f]{1,4}$ ]] || return 1
      count=$((count + 1))
    done
  done
  if [[ $1 == *::* ]]; then
    ((count <= 7))
  else
    ((count == 8))
  fi
}

wg_valid_port() {
  [[ $1 =~ ^[1-9][0-9]{0,4}$ ]] && (($1 <= 65535))
}

# <ipv4>/<1-32>, for the interface address (10.77.0.1/24).
wg_valid_address() {
  local ip prefix
  [[ $1 =~ ^([0-9.]+)/([1-9][0-9]?)$ ]] || return 1
  ip=${BASH_REMATCH[1]}
  prefix=${BASH_REMATCH[2]}
  wg_valid_ipv4 "$ip" && ((prefix <= 32))
}

# <ipv4>/32, the one address a WireGuard peer may use.
wg_valid_peer_ip() {
  [[ $1 == */32 ]] && wg_valid_ipv4 "${1%/32}"
}

# A source address for the firewall: an IPv4 or IPv6 address, optionally with a prefix length.
# Prints "4" or "6" for the family on success.
wg_source_family() {
  local address=$1 prefix=''
  if [[ $address == */* ]]; then
    prefix=${address#*/}
    address=${address%/*}
    [[ $prefix =~ ^[1-9][0-9]{0,2}$ ]] || return 1
  fi
  if wg_valid_ipv4 "$address"; then
    [[ -z $prefix ]] || ((prefix <= 32)) || return 1
    printf '4'
  elif wg_valid_ipv6 "$address"; then
    [[ -z $prefix ]] || ((prefix <= 128)) || return 1
    printf '6'
  else
    return 1
  fi
}

# host:port with an IPv4 literal, a [bracketed IPv6] literal or a host name.
wg_valid_endpoint() {
  local host port
  if [[ $1 =~ ^\[([^]]+)\]:([0-9]+)$ ]]; then
    host=${BASH_REMATCH[1]}
    port=${BASH_REMATCH[2]}
    wg_valid_ipv6 "$host" && wg_valid_port "$port"
  elif [[ $1 =~ ^([^:]+):([0-9]+)$ ]]; then
    host=${BASH_REMATCH[1]}
    port=${BASH_REMATCH[2]}
    wg_valid_port "$port" || return 1
    if [[ $host =~ ^[0-9.]+$ ]]; then
      wg_valid_ipv4 "$host"
    else
      [[ $host =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]
    fi
  else
    return 1
  fi
}

# Comma separated TCP ports, each valid. Prints them without duplicates, in the order given.
wg_normalize_ports() {
  local port seen=',' out=''
  local -a ports
  IFS=, read -r -a ports <<<"$1"
  ((${#ports[@]} > 0)) || return 1
  for port in "${ports[@]}"; do
    wg_valid_port "$port" || return 1
    [[ $seen == *",$port,"* ]] && continue
    seen+="$port,"
    out+="${out:+,}$port"
  done
  printf '%s' "$out"
}

# wg_normalize_peers <WG_PEERS value>
# Validates every peer and prints one line per peer: "<key> <allowed ip>/32 <endpoint|-> <ports|->".
# Refuses a malformed key, address, endpoint or port, a duplicate key or address, an empty list.
wg_normalize_peers() {
  local entry line key allowed endpoint ports extra normalized n=0
  local seen_keys=' ' seen_ips=' '
  while IFS= read -r entry; do
    line=${entry#"${entry%%[![:space:]]*}"}
    line=${line%"${line##*[![:space:]]}"}
    [[ -n $line ]] || continue
    n=$((n + 1))
    key='' allowed='' endpoint='' ports='' extra=''
    read -r key allowed endpoint ports extra <<<"$line"
    endpoint=${endpoint:--}
    ports=${ports:--}
    if [[ -n $extra ]]; then
      printf 'peer %d: too many fields (expected: <key> <ip>/32 [<host:port>|-] [<ports>|-])\n' "$n" >&2
      return 1
    fi
    if ! wg_valid_key "$key"; then
      printf 'peer %d: the public key is not 44 characters of base64\n' "$n" >&2
      return 1
    fi
    if ! wg_valid_peer_ip "$allowed"; then
      printf 'peer %d: the allowed address "%s" is not an IPv4 address with /32\n' "$n" "$allowed" >&2
      return 1
    fi
    if [[ $endpoint != - ]] && ! wg_valid_endpoint "$endpoint"; then
      printf 'peer %d: the endpoint "%s" is not host:port\n' "$n" "$endpoint" >&2
      return 1
    fi
    if [[ $ports != - ]]; then
      if ! normalized=$(wg_normalize_ports "$ports"); then
        printf 'peer %d: the ports "%s" are not a comma separated list of TCP ports\n' "$n" "$ports" >&2
        return 1
      fi
      ports=$normalized
    fi
    if [[ $seen_keys == *" $key "* ]]; then
      printf 'peer %d: the public key is listed twice\n' "$n" >&2
      return 1
    fi
    if [[ $seen_ips == *" $allowed "* ]]; then
      printf 'peer %d: the allowed address %s is listed twice\n' "$n" "$allowed" >&2
      return 1
    fi
    seen_keys+="$key "
    seen_ips+="$allowed "
    printf '%s %s %s %s\n' "$key" "$allowed" "$endpoint" "$ports"
  done < <(printf '%s\n' "$1" | tr ';' '\n')
  if ((n == 0)); then
    printf 'the peer list is empty\n' >&2
    return 1
  fi
}

# conf_value <file> <KEY>
# Prints the value of the last KEY=value line, without one pair of surrounding quotes. The file is
# parsed, never sourced. A missing or unreadable file, or a missing key, prints nothing.
conf_value() {
  local line value=''
  [[ -r $1 ]] || return 0
  while IFS= read -r line || [[ -n $line ]]; do
    line=${line%$'\r'}
    if [[ $line == "$2="* ]]; then
      value=${line#*=}
    fi
  done <"$1"
  if [[ ${#value} -ge 2 && ( $value == \"*\" || $value == \'*\' ) ]]; then
    value=${value:1:${#value}-2}
  fi
  printf '%s' "$value"
}
