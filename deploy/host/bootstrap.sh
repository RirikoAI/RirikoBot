#!/usr/bin/env bash
# Prepares an Ubuntu 24.04 host (AWS Lightsail app host, or the Lavalink VPS) to run Ririko, and
# updates the host scripts on it. Safe to run again: every step checks the current state first and
# changes only what differs.
# Usage and what it does: docs/deployment.md, or run it with --help.
set -euo pipefail

REPO="${RIRIKO_REPO:-RirikoAI/RirikoBot}"

usage() {
  cat <<'EOF'
Usage: sudo bash bootstrap.sh --ref <tag|branch> [--role app|lavalink]
                              [--deploy-key "<ssh public key>"]
                              [--deploy-key-staging "<key>"] [--deploy-key-production "<key>"]
                              [--tunnel-token-file <path>]

Prepares a fresh Ubuntu 24.04 host for Ririko, or updates a prepared one. Running it again
changes only what differs from the state it describes.

Options:
  --ref <tag|branch>          Git ref of RirikoAI/RirikoBot to take deploy/host from
                              (for example v2.0.0 or develop/2.0.0). Required.
  --role app|lavalink         app (default): a Lightsail host that runs the bot stack. Enables the
                              backup and watchdog timers.
                              lavalink: the Lavalink VPS. Enables only the watchdog timer, creates
                              no backup directories, and installs the "inet ririko" firewall
                              (default drop; WireGuard and the per-peer Lavalink ports only).
  --deploy-key "<key>"        SSH public key CI uses to deploy (role app only). Written to the
                              deploy user's authorized_keys with a forced command. Without it, the
                              file is left alone.
  --deploy-key-staging "<key>", --deploy-key-production "<key>"
                              The same for role lavalink, one key per CI context. Each key may only
                              deploy its own instance (forced command "ririko-deploy-ssh staging"
                              or "ririko-deploy-ssh production"). A key that is not given keeps its
                              current line.
  --tunnel-token-file <path>  File holding the Cloudflare Tunnel token. Used only when the
                              cloudflared service does not exist yet; the file is shredded after
                              the service is installed.
  -h, --help                  Print this text and exit.

Both roles install WireGuard, create /etc/wireguard/private.key once and print the public key.
When /etc/ririko/ririko.conf has WG_ADDRESS and WG_PEERS they render /etc/wireguard/wg0.conf and
enable wg-quick@wg0; the lavalink role also needs WG_ALLOWED_ENDPOINTS for its firewall (keys:
/etc/ririko/ririko.conf.example).

Run as root. Only Ubuntu 24.04 is supported. Environment: RIRIKO_REPO (default
RirikoAI/RirikoBot) selects another GitHub repository.
EOF
}

log() { printf '[bootstrap] %s\n' "$*"; }
warn() { printf '[bootstrap] WARNING: %s\n' "$*" >&2; }
die() {
  printf '[bootstrap] ERROR: %s\n' "$*" >&2
  exit 1
}
usage_error() {
  printf '[bootstrap] ERROR: %s\nRun with --help for usage.\n' "$*" >&2
  exit 2
}

# --- Arguments (checked before anything needs root) ---------------------------------------------

for arg in "$@"; do
  if [[ $arg == -h || $arg == --help ]]; then
    usage
    exit 0
  fi
done

REF=''
ROLE=app
DEPLOY_KEY=''
DEPLOY_KEY_STAGING=''
DEPLOY_KEY_PRODUCTION=''
TOKEN_FILE=''
while (($#)); do
  case $1 in
    --ref | --role | --deploy-key | --deploy-key-staging | --deploy-key-production | --tunnel-token-file)
      (($# >= 2)) || usage_error "$1 needs a value"
      case $1 in
        --ref) REF=$2 ;;
        --role) ROLE=$2 ;;
        --deploy-key) DEPLOY_KEY=$2 ;;
        --deploy-key-staging) DEPLOY_KEY_STAGING=$2 ;;
        --deploy-key-production) DEPLOY_KEY_PRODUCTION=$2 ;;
        --tunnel-token-file) TOKEN_FILE=$2 ;;
      esac
      shift 2
      ;;
    *) usage_error "unknown option: $1" ;;
  esac
done

[[ -n $REF ]] || usage_error '--ref is required'
# The ref becomes part of a download URL.
[[ $REF =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ && $REF != *..* ]] || usage_error "invalid --ref: $REF"
[[ $REPO =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || usage_error "invalid RIRIKO_REPO: $REPO"

# The key becomes part of an authorized_keys line: one line, no double quotes.
KEY_PATTERN='^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) [A-Za-z0-9+/]+=*( [^"[:cntrl:]]*)?$'
for key_option in DEPLOY_KEY DEPLOY_KEY_STAGING DEPLOY_KEY_PRODUCTION; do
  if [[ -n ${!key_option} && ! ${!key_option} =~ $KEY_PATTERN ]]; then
    usage_error "--$(tr '[:upper:]_' '[:lower:]-' <<<"$key_option") is not a single-line SSH public key"
  fi
done
[[ $ROLE == app || $ROLE == lavalink ]] || usage_error "invalid --role: $ROLE (use app or lavalink)"
if [[ $ROLE == app && ( -n $DEPLOY_KEY_STAGING || -n $DEPLOY_KEY_PRODUCTION ) ]]; then
  usage_error '--deploy-key-staging and --deploy-key-production are for --role lavalink; use --deploy-key'
fi
if [[ $ROLE == lavalink && -n $DEPLOY_KEY ]]; then
  usage_error '--deploy-key is for --role app; use --deploy-key-staging and --deploy-key-production'
fi
if [[ -n $TOKEN_FILE && ! -f $TOKEN_FILE ]]; then
  usage_error "--tunnel-token-file: no such file: $TOKEN_FILE"
fi

# --- Preconditions ------------------------------------------------------------------------------

[[ $EUID -eq 0 ]] || die 'run as root (sudo bash bootstrap.sh ...)'

os_field() (
  # shellcheck source=/dev/null
  . /etc/os-release
  printf '%s' "${!1:-}"
)
[[ $(os_field ID) == ubuntu && $(os_field VERSION_ID) == 24.04 ]] ||
  die "only Ubuntu 24.04 is supported (this is $(os_field PRETTY_NAME))"
CODENAME=$(os_field VERSION_CODENAME)
ARCH=$(dpkg --print-architecture)

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
export DEBIAN_FRONTEND=noninteractive

# --- Helpers ------------------------------------------------------------------------------------

# sync_file <src> <dest> <mode> [owner:group]
# Installs <src> as <dest> (default root:root, mode without leading zero, for example 644).
# Returns 0 when it wrote the file and 1 when the file already matched, so call it in an `if`.
sync_file() {
  local src=$1 dest=$2 mode=$3 owner=${4:-root:root}
  if [[ -f $dest && ! -L $dest ]] && cmp -s "$src" "$dest" &&
    [[ $(stat -c '%a:%U:%G' "$dest") == "$mode:$owner" ]]; then
    return 1
  fi
  install -D -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$src" "$dest"
  log "wrote $dest"
  return 0
}

APT_FRESH=0
apt_update_once() {
  if ((APT_FRESH == 0)); then
    apt-get update -qq
    APT_FRESH=1
  fi
}

pkg_installed() {
  [[ $(dpkg-query -W -f='${Status}' "$1" 2>/dev/null) == 'install ok installed' ]]
}

ensure_packages() {
  local missing=() package
  for package in "$@"; do
    pkg_installed "$package" || missing+=("$package")
  done
  if ((${#missing[@]} > 0)); then
    log "installing packages: ${missing[*]}"
    apt_update_once
    apt-get install -y -qq --no-install-recommends "${missing[@]}"
  fi
}

# True when an apt source already points at <needle>, however it was added.
apt_source_exists() {
  grep -rqs -- "$1" /etc/apt/sources.list /etc/apt/sources.list.d
}

unit_exists() {
  systemctl cat "$1" >/dev/null 2>&1
}

ensure_enabled_and_started() {
  systemctl is-enabled --quiet "$1" || systemctl enable "$1" >/dev/null 2>&1
  systemctl is-active --quiet "$1" || systemctl start "$1"
}

# --- Steps --------------------------------------------------------------------------------------

# extract_deploy_host <archive> <dest>
# Extracts only deploy/host from a codeload archive (one top-level <repo>-<ref> directory, which
# --strip-components=1 drops). The single member '*/deploy/host' also takes everything below it;
# GNU tar reports a second member such as '*/deploy/host/*' as "Not found in archive" and exits 2.
# scripts/deploy-host.test.ts runs this function from this file, so keep it self-contained.
extract_deploy_host() {
  tar -xzf "$1" -C "$2" --strip-components=1 --wildcards '*/deploy/host' ||
    die "$REF has no deploy/host directory"
}

fetch_release_tree() {
  local url="https://codeload.github.com/${REPO}/tar.gz/${REF}"
  log "downloading deploy/host from $url"
  curl -fsSL --retry 3 --retry-delay 2 -o "$WORK/release.tar.gz" "$url" ||
    die "could not download $url (does the ref exist and is the repository public?)"
  mkdir "$WORK/release"
  extract_deploy_host "$WORK/release.tar.gz" "$WORK/release"
  SRC="$WORK/release/deploy/host"
  [[ -d $SRC/files ]] || die "$REF has no deploy/host/files directory"
  load_libs
}

# The WireGuard and firewall renderers come from the same tree as everything else, so they follow
# --ref. Sourcing them defines functions only.
load_libs() {
  local lib
  for lib in wg-common render-wireguard render-nftables; do
    [[ -f $SRC/lib/$lib.sh ]] || die "$REF has no deploy/host/lib/$lib.sh"
  done
  # shellcheck source=/dev/null
  . "$SRC/lib/wg-common.sh"
  # shellcheck source=/dev/null
  . "$SRC/lib/render-wireguard.sh"
  # shellcheck source=/dev/null
  . "$SRC/lib/render-nftables.sh"
}

set_timezone() {
  local zone
  zone=$(timedatectl show --property=Timezone --value 2>/dev/null || true)
  if [[ $zone != Etc/UTC && $zone != UTC ]]; then
    log "setting the timezone to UTC (was ${zone:-unknown}); the reboot window below is UTC"
    timedatectl set-timezone Etc/UTC
  fi
}

ensure_swap() {
  if [[ -z $(swapon --noheadings --show) ]]; then
    log 'no swap found: creating a 2 GB /swapfile'
    if [[ ! -e /swapfile ]]; then
      fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
      chmod 600 /swapfile
      mkswap /swapfile >/dev/null
    fi
    swapon /swapfile
    grep -Eq '^/swapfile[[:space:]]' /etc/fstab ||
      printf '/swapfile none swap sw 0 0\n' >>/etc/fstab
  fi
  # Prefer RAM: swap is only a safety net for the JVM and Postgres.
  local conf=/etc/sysctl.d/60-ririko-swap.conf
  if ! grep -Eq '^vm\.swappiness[[:space:]]*=[[:space:]]*10[[:space:]]*$' "$conf" 2>/dev/null; then
    printf '# Managed by deploy/host/bootstrap.sh (Ririko).\nvm.swappiness=10\n' >"$conf"
    chmod 644 "$conf"
    sysctl -q -p "$conf"
    log "wrote $conf"
  fi
}

setup_unattended_upgrades() {
  ensure_packages unattended-upgrades
  sync_file "$SRC/files/apt-20auto-upgrades" /etc/apt/apt.conf.d/20auto-upgrades 644 || true
  sync_file "$SRC/files/apt-52ririko-unattended-upgrades" \
    /etc/apt/apt.conf.d/52ririko-unattended-upgrades 644 || true
  ensure_enabled_and_started apt-daily.timer
  ensure_enabled_and_started apt-daily-upgrade.timer
}

setup_docker() {
  # daemon.json goes first, so a fresh install starts with it. An already running Docker needs a
  # restart to pick it up (live-restore keeps the containers running through it).
  if sync_file "$SRC/files/daemon.json" /etc/docker/daemon.json 644 &&
    systemctl is-active --quiet docker; then
    log 'daemon.json changed: restarting Docker'
    systemctl restart docker
  fi

  if apt_source_exists download.docker.com; then
    log "an apt source for download.docker.com already exists; leaving it"
  else
    log 'adding the Docker apt repository'
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL --retry 3 -o "$WORK/docker.asc" https://download.docker.com/linux/ubuntu/gpg
    install -m 0644 -o root -g root "$WORK/docker.asc" /etc/apt/keyrings/docker.asc
    cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${CODENAME}
Components: stable
Architectures: ${ARCH}
Signed-By: /etc/apt/keyrings/docker.asc
EOF
    APT_FRESH=0
  fi
  ensure_packages docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  ensure_enabled_and_started docker.service

  # docker-compose.remote-lavalink.yml uses !override, which needs Compose 2.24.4 or newer.
  local version
  version=$(docker compose version --short 2>/dev/null || true)
  version=${version#v}
  if [[ -z $version ]]; then
    warn 'could not read the Docker Compose version'
  elif [[ $(printf '2.24.4\n%s\n' "$version" | sort -V | head -n 1) != 2.24.4 ]]; then
    warn "Docker Compose $version is older than 2.24.4; docker-compose.remote-lavalink.yml needs it"
  fi
}

setup_cloudflared() {
  if apt_source_exists pkg.cloudflare.com/cloudflared; then
    log 'an apt source for pkg.cloudflare.com/cloudflared already exists; leaving it'
  else
    log 'adding the Cloudflare apt repository'
    install -d -m 0755 /usr/share/keyrings
    curl -fsSL --retry 3 -o "$WORK/cloudflare-main.gpg" https://pkg.cloudflare.com/cloudflare-main.gpg
    install -m 0644 -o root -g root "$WORK/cloudflare-main.gpg" /usr/share/keyrings/cloudflare-main.gpg
    printf 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main\n' \
      >/etc/apt/sources.list.d/cloudflared.list
    APT_FRESH=0
  fi
  ensure_packages cloudflared

  if unit_exists cloudflared.service; then
    if [[ -n $TOKEN_FILE ]]; then
      warn 'the cloudflared service already exists: ignoring --tunnel-token-file (file kept)'
    fi
  elif [[ -n $TOKEN_FILE ]]; then
    local token
    token=$(tr -d '[:space:]' <"$TOKEN_FILE")
    [[ -n $token ]] || die "$TOKEN_FILE is empty"
    log 'installing the cloudflared service'
    cloudflared service install "$token"
    shred -u "$TOKEN_FILE"
    log "shredded $TOKEN_FILE"
  else
    warn 'no cloudflared service yet; run again with --tunnel-token-file <path> to install it'
  fi
}

# render_deploy_authorized_keys <current authorized_keys file>
# Prints the deploy user's authorized_keys, from ROLE and the DEPLOY_KEY* options. Every key is
# forced to ririko-deploy-ssh and nothing else (restrict drops forwarding, pty and the rest).
#   app       the one --deploy-key.
#   lavalink  one line per CI context, "ririko-deploy-ssh staging" and "ririko-deploy-ssh
#             production", so a context can only deploy its own instance. A context whose key was
#             not given this run keeps its line from the current file (if it has one).
# scripts/deploy-host.test.ts runs this function from this file, so keep it self-contained.
render_deploy_authorized_keys() {
  local current=$1 context key
  if [[ $ROLE == app ]]; then
    printf 'restrict,command="/usr/local/bin/ririko-deploy-ssh" %s\n' "$DEPLOY_KEY"
    return 0
  fi
  for context in staging production; do
    key=$DEPLOY_KEY_STAGING
    [[ $context == staging ]] || key=$DEPLOY_KEY_PRODUCTION
    if [[ -n $key ]]; then
      printf 'restrict,command="/usr/local/bin/ririko-deploy-ssh %s" %s\n' "$context" "$key"
    elif [[ -r $current ]]; then
      grep -F -- "command=\"/usr/local/bin/ririko-deploy-ssh $context\" " "$current" || true
    fi
  done
}

setup_deploy_user() {
  if ! id -u deploy >/dev/null 2>&1; then
    log 'creating the deploy user'
    useradd --create-home --shell /bin/sh --comment 'Ririko deploy (forced command only)' deploy
  fi
  # The forced command runs through the user's login shell, so the shell must be a real one.
  [[ $(getent passwd deploy | cut -d: -f7) == /bin/sh ]] || usermod --shell /bin/sh deploy
  local _ state
  read -r _ state _ < <(passwd -S deploy)
  [[ $state == L ]] || passwd -l deploy >/dev/null
  # docker group membership is root-equivalent; deploy reaches Docker only through sudo.
  if [[ " $(id -nG deploy) " == *' docker '* ]]; then
    log 'removing deploy from the docker group'
    gpasswd -d deploy docker >/dev/null
  fi

  if [[ -n $DEPLOY_KEY || -n $DEPLOY_KEY_STAGING || -n $DEPLOY_KEY_PRODUCTION ]]; then
    local home
    home=$(getent passwd deploy | cut -d: -f6)
    install -d -m 0700 -o deploy -g deploy "$home/.ssh"
    render_deploy_authorized_keys "$home/.ssh/authorized_keys" >"$WORK/authorized_keys"
    sync_file "$WORK/authorized_keys" "$home/.ssh/authorized_keys" 600 deploy:deploy || true
  else
    log 'no deploy key option: leaving the deploy user authorized_keys as it is'
  fi

  visudo -cf "$SRC/files/sudoers-ririko-deploy" >/dev/null ||
    die 'files/sudoers-ririko-deploy does not pass visudo'
  if sync_file "$SRC/files/sudoers-ririko-deploy" /etc/sudoers.d/ririko-deploy 440; then
    visudo -cf /etc/sudoers.d/ririko-deploy >/dev/null || {
      rm -f /etc/sudoers.d/ririko-deploy
      die 'the installed sudoers rule failed visudo and was removed'
    }
  fi
}

install_host_scripts() {
  local file name changed=0
  shopt -s nullglob
  for file in "$SRC"/bin/*.sh; do
    name=$(basename "$file" .sh)
    role_skips "$name" && continue
    sync_file "$file" "/usr/local/bin/$name" 755 || true
  done
  for file in "$SRC"/systemd/*; do
    role_skips "$(basename "$file")" && continue
    sync_file "$file" "/etc/systemd/system/$(basename "$file")" 644 && changed=1
  done
  shopt -u nullglob
  if ((changed)); then
    systemctl daemon-reload
  fi
  for file in "$SRC"/systemd/*.timer; do
    [[ -e $file ]] || continue
    name=$(basename "$file")
    role_skips "$name" && continue
    systemctl is-enabled --quiet "$name" || systemctl enable "$name" >/dev/null 2>&1
    systemctl is-active --quiet "$name" || systemctl start "$name"
  done
  # The Lavalink host keeps no database or app volumes. A backup timer that an earlier bootstrap
  # (from before roles existed) enabled there would only fail every night.
  if [[ $ROLE == lavalink ]] && unit_exists ririko-backup.timer &&
    { systemctl is-enabled --quiet ririko-backup.timer || systemctl is-active --quiet ririko-backup.timer; }; then
    log 'disabling ririko-backup.timer: the lavalink role has nothing to back up'
    systemctl disable --now ririko-backup.timer >/dev/null 2>&1
  fi
}

# True for the host scripts and units this role does not install or enable: the lavalink role runs
# only the watchdog, so it gets no ririko-backup script, service or timer.
role_skips() {
  [[ $ROLE == lavalink && $1 == ririko-backup* ]]
}

harden_ssh() {
  local dest=/etc/ssh/sshd_config.d/10-ririko.conf backup=''
  if [[ -f $dest ]]; then
    backup="$WORK/10-ririko.conf.previous"
    cp -p "$dest" "$backup"
  fi
  # sshd -t needs this directory, which socket-activated sshd may not have created yet.
  install -d -m 0755 /run/sshd
  if sync_file "$SRC/files/sshd-10-ririko.conf" "$dest" 644; then
    if ! sshd -t; then
      if [[ -n $backup ]]; then
        install -m 0644 -o root -g root "$backup" "$dest"
      else
        rm -f "$dest"
      fi
      die 'sshd -t rejected the new drop-in; restored the previous state, ssh was not reloaded'
    fi
    if systemctl is-active --quiet ssh; then
      systemctl reload ssh
      log 'reloaded ssh'
    fi
  fi
}

create_layout() {
  install -d -m 0750 -o root -g root /opt/ririko /opt/ririko/releases /opt/ririko/state /etc/ririko
  # Only the app role has a database and volumes to back up.
  if [[ $ROLE == app ]]; then
    install -d -m 0750 -o root -g root /opt/ririko/backups /opt/ririko/backups/predeploy \
      /opt/ririko/backups/nightly
  fi
  # The example is always refreshed, so new keys show up; the real config is never overwritten.
  sync_file "$SRC/ririko.conf.example" /etc/ririko/ririko.conf.example 644 || true
  if [[ ! -e /etc/ririko/ririko.conf ]]; then
    install -m 0600 -o root -g root "$SRC/ririko.conf.example" /etc/ririko/ririko.conf
    log 'created /etc/ririko/ririko.conf from the example'
  fi
}

WIREGUARD_KEY=/etc/wireguard/private.key
WIREGUARD_PUBLIC_KEY=''
WIREGUARD_STATE='not set up'
FIREWALL_STATE='not applicable'

# WireGuard link (10.77.0.0/24, docs/deployment.md): the Lavalink password never crosses the
# internet in clear text. Both roles get the tools and a private key (kept once, never rotated by
# this script, so the public key stays valid), and print the public key for the other side's
# WG_PEERS. wg0.conf is rendered only once ririko.conf has WG_ADDRESS and WG_PEERS, so a first run
# on a fresh host just prepares the key.
setup_wireguard() {
  local conf=/etc/ririko/ririko.conf address peers port='' private_key changed=0
  ensure_packages wireguard-tools

  install -d -m 0700 -o root -g root /etc/wireguard
  if [[ ! -s $WIREGUARD_KEY ]]; then
    log 'generating the WireGuard private key'
    (umask 077 && wg genkey >"$WORK/private.key")
    install -m 0600 -o root -g root "$WORK/private.key" "$WIREGUARD_KEY"
    shred -u "$WORK/private.key"
  fi
  [[ $(stat -c '%a:%U:%G' "$WIREGUARD_KEY") == 600:root:root ]] || {
    chown root:root "$WIREGUARD_KEY"
    chmod 600 "$WIREGUARD_KEY"
  }
  WIREGUARD_PUBLIC_KEY=$(wg pubkey <"$WIREGUARD_KEY")
  log "WireGuard public key of this host: $WIREGUARD_PUBLIC_KEY"

  address=$(conf_value "$conf" WG_ADDRESS)
  peers=$(conf_value "$conf" WG_PEERS)
  if [[ -z $address || -z $peers ]]; then
    WIREGUARD_STATE='key only (set WG_ADDRESS and WG_PEERS in /etc/ririko/ririko.conf, then run again)'
    warn "WG_ADDRESS and WG_PEERS are not both set in $conf: /etc/wireguard/wg0.conf not written"
    return 0
  fi
  if [[ $ROLE == lavalink ]]; then
    port=$(conf_value "$conf" WG_LISTEN_PORT)
    port=${port:-51820}
  fi
  private_key=$(<"$WIREGUARD_KEY")
  render_wireguard_conf "$ROLE" "$address" "$port" "$private_key" "$peers" >"$WORK/wg0.conf" ||
    die "invalid WireGuard settings in $conf (nothing was written)"
  if sync_file "$WORK/wg0.conf" /etc/wireguard/wg0.conf 600; then
    changed=1
  fi
  systemctl is-enabled --quiet wg-quick@wg0 || systemctl enable wg-quick@wg0 >/dev/null 2>&1
  if ! systemctl is-active --quiet wg-quick@wg0; then
    systemctl start wg-quick@wg0 ||
      die 'wg-quick@wg0 did not start (journalctl -u wg-quick@wg0)'
  elif ((changed)); then
    log 'wg0.conf changed: restarting wg-quick@wg0'
    systemctl restart wg-quick@wg0 ||
      die 'wg-quick@wg0 did not restart (journalctl -u wg-quick@wg0)'
  fi
  WIREGUARD_STATE="wg0 up as $address"
}

# True while table inet ririko is loaded with a drop policy on its input chain.
firewall_loaded() {
  nft list chain inet ririko input 2>/dev/null | grep -q 'policy drop'
}

# The hand-made firewall the Lavalink VPS ran before this script (table inet ririko_interim, loaded
# by ririko-firewall-interim.service from /etc/ririko/firewall-interim.nft). Called only after the
# new table is loaded and checked, so the host never runs without a drop policy.
remove_interim_firewall() {
  local unit=ririko-firewall-interim.service removed=0
  if unit_exists "$unit"; then
    log "disabling $unit"
    systemctl disable --now "$unit" >/dev/null 2>&1 || true
    removed=1
  fi
  if [[ -e /etc/systemd/system/$unit ]]; then
    rm -f "/etc/systemd/system/$unit"
    removed=1
  fi
  if [[ -e /etc/ririko/firewall-interim.nft ]]; then
    rm -f /etc/ririko/firewall-interim.nft
    log 'removed /etc/ririko/firewall-interim.nft'
  fi
  if nft list table inet ririko_interim >/dev/null 2>&1; then
    nft delete table inet ririko_interim
    log 'deleted table inet ririko_interim'
  fi
  if ((removed)); then
    systemctl daemon-reload
  fi
}

# Firewall of the Lavalink host: table inet ririko, input policy drop, loaded at every boot by
# ririko-firewall.service. The rules come from render_nftables (lib/render-nftables.sh) and are
# checked with nft -c before anything is installed or loaded. Never `flush ruleset`: Docker's
# tables live in the same ruleset.
setup_firewall() {
  local conf=/etc/ririko/ririko.conf endpoints peers port changed=0
  ensure_packages nftables

  endpoints=$(conf_value "$conf" WG_ALLOWED_ENDPOINTS)
  peers=$(conf_value "$conf" WG_PEERS)
  port=$(conf_value "$conf" WG_LISTEN_PORT)
  port=${port:-51820}
  if [[ -z $endpoints || -z $peers ]]; then
    FIREWALL_STATE='NOT installed (set WG_PEERS and WG_ALLOWED_ENDPOINTS in /etc/ririko/ririko.conf, then run again)'
    warn "WG_PEERS and WG_ALLOWED_ENDPOINTS are not both set in $conf: the firewall was left as it is"
    return 0
  fi

  render_nftables "$port" "$endpoints" "$peers" >"$WORK/ririko.nft" ||
    die "invalid firewall settings in $conf (the firewall was not changed)"
  nft -c -f "$WORK/ririko.nft" ||
    die 'nft rejected the rendered rules (the firewall was not changed)'
  if sync_file "$WORK/ririko.nft" /etc/nftables.d/ririko.nft 644; then
    changed=1
  fi
  if sync_file "$SRC/files/ririko-firewall.service" /etc/systemd/system/ririko-firewall.service 644; then
    systemctl daemon-reload
    changed=1
  fi
  systemctl is-enabled --quiet ririko-firewall.service ||
    systemctl enable ririko-firewall.service >/dev/null 2>&1
  if ((changed)) || ! systemctl is-active --quiet ririko-firewall.service || ! firewall_loaded; then
    log 'loading table inet ririko'
    systemctl restart ririko-firewall.service ||
      die 'ririko-firewall.service failed (journalctl -u ririko-firewall.service)'
  fi
  firewall_loaded || die 'table inet ririko (input policy drop) is not loaded'

  remove_interim_firewall
  if ! firewall_loaded; then
    warn 'table inet ririko disappeared while the interim firewall was removed: loading it again'
    systemctl restart ririko-firewall.service ||
      die 'ririko-firewall.service failed (journalctl -u ririko-firewall.service)'
    firewall_loaded || die 'table inet ririko (input policy drop) is not loaded'
  fi
  FIREWALL_STATE='table inet ririko loaded (input policy drop)'
}

print_next_steps() {
  local token_state='service present'
  unit_exists cloudflared.service || token_state='NOT installed (run again with --tunnel-token-file)'
  if [[ $ROLE == app ]]; then
    local key_state='installed'
    [[ -n $DEPLOY_KEY ]] || key_state='NOT installed (run again with --deploy-key)'
    cat <<EOF

[bootstrap] Done: $REPO @ $REF (role app).
  CI deploy key:      $key_state
  Cloudflare tunnel:  $token_state
  WireGuard:          $WIREGUARD_STATE
  WireGuard public key (give it to the Lavalink host's WG_PEERS): $WIREGUARD_PUBLIC_KEY

Remaining manual steps:
  1. Put the app settings in /opt/ririko/.env.production (root:root, 0600). Start from
     .env.production.example in the repository.
  2. Edit /etc/ririko/ririko.conf (see /etc/ririko/ririko.conf.example for the keys), including
     WG_ADDRESS and WG_PEERS for the WireGuard link, then run bootstrap again.
  3. In the Cloudflare dashboard, point the tunnel's public hostnames at this host
     (the dashboard at http://localhost:3000, SSH at ssh://localhost:22).
  4. Deploy a release with ririko-deploy (docs/deployment.md).
EOF
  else
    local staging_state='left as it is' production_state='left as it is'
    [[ -z $DEPLOY_KEY_STAGING ]] || staging_state='installed'
    [[ -z $DEPLOY_KEY_PRODUCTION ]] || production_state='installed'
    cat <<EOF

[bootstrap] Done: $REPO @ $REF (role lavalink).
  CI deploy key (staging):     $staging_state
  CI deploy key (production):  $production_state
  Cloudflare tunnel:           $token_state
  WireGuard:                   $WIREGUARD_STATE
  Firewall:                    $FIREWALL_STATE
  WireGuard public key (give it to each app host's WG_PEERS): $WIREGUARD_PUBLIC_KEY

Remaining manual steps:
  1. Edit /etc/ririko/ririko.conf (see /etc/ririko/ririko.conf.example): WG_ADDRESS, WG_PEERS with
     each app host's public key, tunnel address and Lavalink port, and WG_ALLOWED_ENDPOINTS with
     the app hosts' public addresses. Then run bootstrap again.
  2. In the Cloudflare dashboard, point the tunnel's SSH hostname at ssh://localhost:22.
  3. Start the Lavalink containers (docs/deployment.md).
EOF
  fi
}

# --- Run ----------------------------------------------------------------------------------------

ensure_packages ca-certificates curl jq
fetch_release_tree
set_timezone
ensure_swap
setup_unattended_upgrades
setup_docker
setup_cloudflared
setup_deploy_user
install_host_scripts
harden_ssh
create_layout
setup_wireguard
if [[ $ROLE == lavalink ]]; then
  setup_firewall
fi
print_next_steps
