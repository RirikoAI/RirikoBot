#!/usr/bin/env bash
# ririko-deploy: deploys one released version of Ririko on this host, or shows what runs.
# Installed as /usr/local/bin/ririko-deploy (root, 0755). The deploy user reaches it only through
# one sudoers rule, and CI reaches that user only through ririko-deploy-ssh.
#
#   ririko-deploy deploy <version>   version is X.Y.Z or X.Y.Z-prerelease
#   ririko-deploy status
#
# A deploy downloads the compose files of the tagged release from GitHub (so the caller can only
# choose a published version), dumps Postgres when a release is already running, pulls and starts
# the new images, and waits until the bot and the dashboard report ready. When that fails it starts
# the previous release again. Secrets stay on the host in RIRIKO_ENV_FILE.
#
# Exit codes (stable, docs/release.md and the CircleCI job rely on them):
#   0  deployed (or status printed)
#   1  failed before the running release was touched (bad tag or file, dump failure, bad config)
#   2  rejected command or version
#   3  another deploy, backup or watchdog run holds the lock
#   4  the new release failed and the previous one was started again
#   5  the new release failed and there is no previous release to start
#
# Settings come from the environment and then from /etc/ririko/ririko.conf (see
# deploy/host/ririko.conf.example). RIRIKO_ROOT, RIRIKO_CONF, RIRIKO_LOCK, DOCKER, CURL and
# READY_POLL_SECONDS can be overridden for tests.
set -Eeuo pipefail
export LC_ALL=C
umask 022

readonly VERSION_PATTERN='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'
readonly KEEP_DUMPS=5
# Files every release needs besides the compose files. The Lavalink image mounts it.
readonly RELEASE_EXTRA_FILES=(docker/lavalink/application.yml)

# Probes run inside the containers (the images have no curl), like their Docker HEALTHCHECKs.
# The bot's /ready is 200 after startup and the Discord gateway READY; the port is the bot's own
# HEALTH_PORT from the env file (default 8080). The dashboard's /api/ready is 200 when its
# database answers.
readonly BOT_PROBE='fetch("http://127.0.0.1:"+(process.env.HEALTH_PORT||8080)+"/ready",{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))'
readonly WEB_PROBE='fetch("http://127.0.0.1:3000/api/ready",{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))'

RIRIKO_ROOT=${RIRIKO_ROOT:-/opt/ririko}
RIRIKO_CONF=${RIRIKO_CONF:-/etc/ririko/ririko.conf}
RIRIKO_LOCK=${RIRIKO_LOCK:-/run/lock/ririko-deploy.lock}
DOCKER=${DOCKER:-docker}
CURL=${CURL:-curl}
READY_POLL_SECONDS=${READY_POLL_SECONDS:-5}
RIRIKO_REPO=${RIRIKO_REPO:-RirikoAI/RirikoBot}
RIRIKO_COMPOSE_FILES=${RIRIKO_COMPOSE_FILES:-docker-compose.production.yml}
RIRIKO_ENV_FILE=${RIRIKO_ENV_FILE:-$RIRIKO_ROOT/.env.production}
READY_TIMEOUT=${READY_TIMEOUT:-300}

LOG_FILE=$RIRIKO_ROOT/deploy.log
COMPOSE_FILES=()
TMP_DIR=""

# --- logging ----------------------------------------------------------------------------------

stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Prints a timestamped line and appends it to deploy.log (a missing log must not stop a deploy).
log() {
  local line
  line="$(stamp) $*"
  printf '%s\n' "$line"
  printf '%s\n' "$line" >>"$LOG_FILE" 2>/dev/null || true
}

# Logs an error line to stderr and deploy.log, then exits with the given code.
fail() {
  local code=$1 line
  shift
  line="$(stamp) ERROR: $*"
  printf '%s\n' "$line" >&2
  printf '%s\n' "$line" >>"$LOG_FILE" 2>/dev/null || true
  exit "$code"
}

on_error() {
  local line=$1
  trap - ERR
  fail 1 "unexpected error at line $line"
}

cleanup() {
  if [ -n "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}

trap 'on_error $LINENO' ERR
trap cleanup EXIT

usage() {
  cat >&2 <<'EOF'
Usage: ririko-deploy deploy <version>
       ririko-deploy status
EOF
  exit 2
}

# --- configuration ----------------------------------------------------------------------------

# Reads the known KEY=value lines of ririko.conf. The file is never sourced, so a stray line
# cannot run as root. Other keys (backup, watchdog) are ignored here.
load_conf() {
  if [ ! -f "$RIRIKO_CONF" ]; then
    log "no $RIRIKO_CONF, using defaults"
    return 0
  fi
  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line#"${line%%[![:space:]]*}"}
    case $line in
      '' | '#'*) continue ;;
    esac
    if [[ $line != *=* ]]; then
      continue
    fi
    key=${line%%=*}
    value=${line#*=}
    if [[ $value == \"*\" && ${#value} -ge 2 ]]; then
      value=${value:1:${#value}-2}
    elif [[ $value == \'*\' && ${#value} -ge 2 ]]; then
      value=${value:1:${#value}-2}
    fi
    case $key in
      RIRIKO_REPO | RIRIKO_COMPOSE_FILES | RIRIKO_ENV_FILE | READY_TIMEOUT)
        printf -v "$key" '%s' "$value"
        ;;
    esac
  done <"$RIRIKO_CONF"
}

# Checks the settings that end up in URLs, paths and loops, and fills COMPOSE_FILES.
validate_conf() {
  local file
  [[ $RIRIKO_REPO =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] ||
    fail 1 "invalid RIRIKO_REPO '$RIRIKO_REPO' in $RIRIKO_CONF"
  [[ $READY_TIMEOUT =~ ^[0-9]+$ ]] ||
    fail 1 "invalid READY_TIMEOUT '$READY_TIMEOUT' in $RIRIKO_CONF"
  [[ $READY_POLL_SECONDS =~ ^[0-9]+(\.[0-9]+)?$ ]] ||
    fail 1 "invalid READY_POLL_SECONDS '$READY_POLL_SECONDS'"
  read -r -a COMPOSE_FILES <<<"$RIRIKO_COMPOSE_FILES"
  [ "${#COMPOSE_FILES[@]}" -gt 0 ] || fail 1 "RIRIKO_COMPOSE_FILES in $RIRIKO_CONF is empty"
  for file in "${COMPOSE_FILES[@]}"; do
    # A repository-relative path: no leading slash, no "." or ".." component.
    if [[ ! $file =~ ^[A-Za-z0-9_][A-Za-z0-9._-]*(/[A-Za-z0-9_][A-Za-z0-9._-]*)*$ ||
      /$file/ == */../* || /$file/ == */./* ]]; then
      fail 1 "invalid file '$file' in RIRIKO_COMPOSE_FILES"
    fi
  done
}

# --- state ------------------------------------------------------------------------------------

# Prints the version in state/<name> (current or previous), or nothing when it is missing or odd.
read_state() {
  local file=$RIRIKO_ROOT/state/$1 value=""
  if [ -f "$file" ]; then
    IFS= read -r value <"$file" || true
  fi
  if [[ $value =~ $VERSION_PATTERN ]]; then
    printf '%s' "$value"
  fi
}

# Plain files, replaced in one step (no symlinks, so Git Bash and Linux behave the same).
write_state() {
  local dir=$RIRIKO_ROOT/state
  printf '%s\n' "$2" >"$dir/$1.tmp"
  mv -f "$dir/$1.tmp" "$dir/$1"
}

# --- docker compose ---------------------------------------------------------------------------

# docker compose for one downloaded release: project ririko, one -f per file of that release,
# the host env file for interpolation and for the services' env_file.
compose() {
  local version=$1 dir file
  local -a names=() files=()
  shift
  dir=$RIRIKO_ROOT/releases/$version
  if [ -f "$dir/.compose-files" ]; then
    mapfile -t names <"$dir/.compose-files"
  else
    read -r -a names <<<"$RIRIKO_COMPOSE_FILES"
  fi
  for file in "${names[@]}"; do
    files+=(-f "$dir/$file")
  done
  env RIRIKO_VERSION="$version" RIRIKO_ENV_FILE="$RIRIKO_ENV_FILE" \
    "$DOCKER" compose -p ririko "${files[@]}" --env-file "$RIRIKO_ENV_FILE" "$@"
}

# Downloads the files of a release tag into releases/<version>/, keeping the repository layout:
#   download_release <version> <repository-relative file>...
# Everything goes through a temporary directory, so a missing tag or file changes nothing.
download_release() {
  local version=$1 file base dest
  shift
  base="https://raw.githubusercontent.com/$RIRIKO_REPO/v$version"
  dest=$RIRIKO_ROOT/releases/$version
  TMP_DIR=$(mktemp -d "$RIRIKO_ROOT/releases/.tmp.XXXXXX")
  log "downloading $# files of v$version from $RIRIKO_REPO"
  for file in "$@"; do
    mkdir -p "$TMP_DIR/$(dirname "$file")"
    if ! "$CURL" --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      --connect-timeout 15 --max-time 120 --retry 3 --output "$TMP_DIR/$file" "$base/$file"; then
      fail 1 "could not download $base/$file (is v$version published?)"
    fi
    [ -s "$TMP_DIR/$file" ] || fail 1 "$base/$file is empty"
  done
  printf '%s\n' "${COMPOSE_FILES[@]}" >"$TMP_DIR/.compose-files"
  chmod 755 "$TMP_DIR"
  rm -rf "$dest"
  mv "$TMP_DIR" "$dest"
  TMP_DIR=""
}

# Polls until the bot and the dashboard both answer ready, or READY_TIMEOUT seconds pass.
#   wait_ready <version>
# An exec error (container restarting or not there yet) counts as not ready.
wait_ready() {
  local version=$1 deadline=$((SECONDS + READY_TIMEOUT))
  while :; do
    if compose "$version" exec -T bot node -e "$BOT_PROBE" >/dev/null 2>&1 &&
      compose "$version" exec -T web node -e "$WEB_PROBE" >/dev/null 2>&1; then
      return 0
    fi
    if ((SECONDS >= deadline)); then
      return 1
    fi
    sleep "$READY_POLL_SECONDS"
  done
}

# Pulls and starts a downloaded release, then waits for readiness. Returns 1 on any failure.
#   apply_release <version> [tolerate-pull-failure]
apply_release() {
  local version=$1 tolerate_pull=${2:-}
  log "pulling images for $version"
  if ! compose "$version" pull; then
    if [ -z "$tolerate_pull" ]; then
      log "pull failed"
      return 1
    fi
    log "pull failed, using the images already on this host"
  fi
  log "starting $version"
  if ! compose "$version" up -d --no-build --remove-orphans; then
    log "docker compose up failed"
    return 1
  fi
  log "waiting up to ${READY_TIMEOUT}s for the bot and the dashboard to be ready"
  if ! wait_ready "$version"; then
    log "$version did not become ready"
    return 1
  fi
  log "$version is ready"
}

# Prints the container state and the last 100 log lines of bot and web (also into deploy.log).
diagnose() {
  {
    compose "$1" ps || true
    compose "$1" logs --no-color --tail 100 bot web || true
  } 2>&1 | tee -a "$LOG_FILE" || true
}

# --- backups ----------------------------------------------------------------------------------

# Keeps the newest KEEP_DUMPS dumps (the names start with a UTC timestamp, so name order is age).
prune_dumps() {
  local i excess
  local -a dumps=()
  shopt -s nullglob
  dumps=("$RIRIKO_ROOT"/backups/predeploy/*.dump)
  shopt -u nullglob
  excess=$((${#dumps[@]} - KEEP_DUMPS))
  for ((i = 0; i < excess; i++)); do
    rm -f -- "${dumps[i]}"
  done
}

# pg_dump -Fc of the running release's database into backups/predeploy/. Aborts the deploy when
# the dump fails, so a failed dump never costs data. Prints the file name.
#   predeploy_dump <running version>
predeploy_dump() {
  local from=$1 dir out
  dir=$RIRIKO_ROOT/backups/predeploy
  out=$dir/$(date -u +%Y%m%dT%H%M%SZ)-from-$from.dump
  mkdir -p "$dir"
  log "dumping the database to $out"
  if ! (
    umask 077
    # shellcheck disable=SC2016 # the variables are the container's, not ours
    compose "$from" exec -T postgres sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >"$out.part"
  ) || [ ! -s "$out.part" ]; then
    rm -f "$out.part"
    fail 1 "pre-deploy database dump failed; nothing was changed"
  fi
  mv "$out.part" "$out"
  prune_dumps
  printf '%s' "$out"
}

# --- commands ---------------------------------------------------------------------------------

cmd_deploy() {
  local version=$1 current previous running dump="" rollback_to=""
  [[ $version =~ $VERSION_PATTERN ]] || fail 2 "invalid version '$version'"
  if [ "$RIRIKO_ROOT" = /opt/ririko ] && [ "$(id -u)" -ne 0 ]; then
    fail 1 "ririko-deploy must run as root (through sudo)"
  fi
  mkdir -p "$RIRIKO_ROOT/releases" "$RIRIKO_ROOT/state"

  if ! { exec 9>"$RIRIKO_LOCK"; } 2>/dev/null; then
    fail 1 "cannot open the lock file $RIRIKO_LOCK"
  fi
  if ! flock -n 9; then
    fail 3 "another deploy, backup or watchdog run holds $RIRIKO_LOCK"
  fi

  log "deploy $version requested"
  load_conf
  validate_conf
  [ -f "$RIRIKO_ENV_FILE" ] || fail 1 "env file $RIRIKO_ENV_FILE not found"
  rm -rf "$RIRIKO_ROOT"/releases/.tmp.*

  current=$(read_state current)
  previous=$(read_state previous)
  log "current=${current:-none} previous=${previous:-none}"

  download_release "$version" "${COMPOSE_FILES[@]}" "${RELEASE_EXTRA_FILES[@]}"

  if [ -n "$current" ] && [ -d "$RIRIKO_ROOT/releases/$current" ]; then
    if [ "$current" != "$version" ]; then
      rollback_to=$current
    fi
    if running=$(compose "$current" ps --status running --services) &&
      grep -qx postgres <<<"$running"; then
      dump=$(predeploy_dump "$current") || exit 1
    else
      log "postgres is not running, no pre-deploy dump"
    fi
  fi

  if apply_release "$version"; then
    if [ -n "$current" ] && [ "$current" != "$version" ]; then
      write_state previous "$current"
    fi
    write_state current "$version"
    log "deployed $version"
    return 0
  fi

  log "deploy of $version failed"
  diagnose "$version"
  dump=${dump:-none taken}
  if [ -n "$rollback_to" ]; then
    log "rolling back to $rollback_to"
    if apply_release "$rollback_to" tolerate-pull-failure; then
      log "rolled back to $rollback_to"
    else
      log "ROLLBACK FAILED: $rollback_to did not become ready either"
      diagnose "$rollback_to"
    fi
    fail 4 "deploy of $version failed; rolled back to $rollback_to (state/current is unchanged). Pre-deploy dump: $dump. The database was not restored; restore it by hand only if the failed release changed data."
  fi
  fail 5 "deploy of $version failed and there is no previous release to roll back to"
}

cmd_status() {
  local current previous
  load_conf
  validate_conf
  current=$(read_state current)
  previous=$(read_state previous)
  log "status: current=${current:-none} previous=${previous:-none}"
  if [ -n "$current" ] && [ -d "$RIRIKO_ROOT/releases/$current" ]; then
    compose "$current" ps
  fi
}

main() {
  case ${1:-} in
    deploy)
      [ $# -eq 2 ] || usage
      cmd_deploy "$2"
      ;;
    status)
      [ $# -eq 1 ] || usage
      cmd_status
      ;;
    *) usage ;;
  esac
}

main "$@"
