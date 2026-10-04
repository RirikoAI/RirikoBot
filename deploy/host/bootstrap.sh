#!/usr/bin/env bash
# Prepares an Ubuntu 24.04 host (AWS Lightsail) to run Ririko, and updates the host scripts on it.
# Safe to run again: every step checks the current state first and changes only what differs.
# Usage and what it does: docs/deployment.md, or run it with --help.
set -euo pipefail

REPO="${RIRIKO_REPO:-RirikoAI/RirikoBot}"

usage() {
  cat <<'EOF'
Usage: sudo bash bootstrap.sh --ref <tag|branch> [--deploy-key "<ssh public key>"]
                              [--tunnel-token-file <path>]

Prepares a fresh Ubuntu 24.04 host for Ririko, or updates a prepared one. Running it again
changes only what differs from the state it describes.

Options:
  --ref <tag|branch>          Git ref of RirikoAI/RirikoBot to take deploy/host from
                              (for example v2.0.0 or develop/2.0.0). Required.
  --deploy-key "<key>"        SSH public key CI uses to deploy. Written to the deploy user's
                              authorized_keys with a forced command. Without it, the file is left
                              alone.
  --tunnel-token-file <path>  File holding the Cloudflare Tunnel token. Used only when the
                              cloudflared service does not exist yet; the file is shredded after
                              the service is installed.
  -h, --help                  Print this text and exit.

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
DEPLOY_KEY=''
TOKEN_FILE=''
while (($#)); do
  case $1 in
    --ref | --deploy-key | --tunnel-token-file)
      (($# >= 2)) || usage_error "$1 needs a value"
      case $1 in
        --ref) REF=$2 ;;
        --deploy-key) DEPLOY_KEY=$2 ;;
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
if [[ -n $DEPLOY_KEY && ! $DEPLOY_KEY =~ $KEY_PATTERN ]]; then
  usage_error '--deploy-key is not a single-line SSH public key'
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

  if [[ -n $DEPLOY_KEY ]]; then
    local home
    home=$(getent passwd deploy | cut -d: -f6)
    install -d -m 0700 -o deploy -g deploy "$home/.ssh"
    printf 'restrict,command="/usr/local/bin/ririko-deploy-ssh" %s\n' "$DEPLOY_KEY" \
      >"$WORK/authorized_keys"
    sync_file "$WORK/authorized_keys" "$home/.ssh/authorized_keys" 600 deploy:deploy || true
  else
    log 'no --deploy-key: leaving the deploy user authorized_keys as it is'
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
    sync_file "$file" "/usr/local/bin/$name" 755 || true
  done
  for file in "$SRC"/systemd/*; do
    sync_file "$file" "/etc/systemd/system/$(basename "$file")" 644 && changed=1
  done
  shopt -u nullglob
  if ((changed)); then
    systemctl daemon-reload
  fi
  for file in "$SRC"/systemd/*.timer; do
    [[ -e $file ]] || continue
    name=$(basename "$file")
    systemctl is-enabled --quiet "$name" || systemctl enable "$name" >/dev/null 2>&1
    systemctl is-active --quiet "$name" || systemctl start "$name"
  done
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
  install -d -m 0750 -o root -g root /opt/ririko /opt/ririko/releases /opt/ririko/state \
    /opt/ririko/backups /opt/ririko/backups/predeploy /opt/ririko/backups/nightly /etc/ririko
  # The example is always refreshed, so new keys show up; the real config is never overwritten.
  sync_file "$SRC/ririko.conf.example" /etc/ririko/ririko.conf.example 644 || true
  if [[ ! -e /etc/ririko/ririko.conf ]]; then
    install -m 0600 -o root -g root "$SRC/ririko.conf.example" /etc/ririko/ririko.conf
    log 'created /etc/ririko/ririko.conf from the example'
  fi
}

print_next_steps() {
  local key_state='installed' token_state='service present'
  [[ -n $DEPLOY_KEY ]] || key_state='NOT installed (run again with --deploy-key)'
  unit_exists cloudflared.service || token_state='NOT installed (run again with --tunnel-token-file)'
  cat <<EOF

[bootstrap] Done: $REPO @ $REF.
  CI deploy key:      $key_state
  Cloudflare tunnel:  $token_state

Remaining manual steps:
  1. Put the app settings in /opt/ririko/.env.production (root:root, 0600). Start from
     .env.production.example in the repository.
  2. Edit /etc/ririko/ririko.conf (see /etc/ririko/ririko.conf.example for the keys).
  3. In the Cloudflare dashboard, point the tunnel's public hostnames at this host
     (the dashboard at http://localhost:3000, SSH at ssh://localhost:22).
  4. Deploy a release with ririko-deploy (docs/deployment.md).
EOF
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
print_next_steps
