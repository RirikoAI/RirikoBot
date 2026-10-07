#!/usr/bin/env bash
# ririko-backup: nightly, client-side encrypted off-site backup of what cannot be rebuilt.
# Installed as /usr/local/bin/ririko-backup (root, 0755) and started by ririko-backup.timer.
#
#   ririko-backup [run]   dump Postgres, back up the dump and the shared app volumes, apply the
#                         retention policy (and check the repository on Sundays)
#   ririko-backup init    create the restic repository; safe to repeat
#
# restic runs from a pinned container image, so the host needs no extra package. The repository is
# a Lightsail bucket (S3 compatible), encrypted on this host with RESTIC_PASSWORD before upload.
# What is backed up: a pg_dump -Fc of the running release's database and the volumes
# ririko_ririko_data, ririko_card_images, ririko_boss_images and ririko_welcomer_backgrounds,
# mounted read-only. Never backed up: .env.production, ririko.conf (they hold the secrets), the
# Postgres data directory (the dump replaces it) and the Lavalink plugin cache (it is downloaded).
#
# The run takes the deploy lock (RIRIKO_LOCK, shared with ririko-deploy and ririko-watchdog) and
# waits up to BACKUP_LOCK_WAIT seconds for it, so the database dump never overlaps a deploy. The
# lock is released as soon as the dump is written: the upload can take long, restic only reads the
# volumes (they outlive the containers), and the watchdog stays quiet while the lock is held.
#
# bootstrap.sh starts the timer on every host, also before ririko.conf is filled in and before the
# first deploy. In both states a run logs one line and exits 0 without pinging anybody.
#
# When BACKUP_PING_URL is set, a successful run pings it and a failed run pings <url>/fail.
#
# Exit codes:
#   0  backup done, or skipped because the host is not configured or has no deployed release
#   1  failed (dump, restic, invalid configuration)
#   2  rejected command line
#   3  the deploy lock was not free within BACKUP_LOCK_WAIT seconds
#
# Settings come from /etc/ririko/ririko.conf (see deploy/host/ririko.conf.example), which is parsed
# for known keys and never sourced. RIRIKO_ROOT, RIRIKO_CONF, RIRIKO_LOCK, DOCKER and CURL can be
# overridden through the environment for tests.
set -Eeuo pipefail
export LC_ALL=C
umask 077

# Keep this tag in step with RESTIC_IMAGE in deploy/host/ririko.conf.example (a test checks it).
readonly DEFAULT_RESTIC_IMAGE=docker.io/restic/restic:0.19.1
readonly VERSION_PATTERN='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'
# Compose names volumes <project>_<volume>, and the project is always "ririko".
readonly BACKUP_VOLUMES=(ririko_ririko_data ririko_card_images ririko_boss_images ririko_welcomer_backgrounds)
readonly REQUIRED_KEYS=(RIRIKO_ENV_NAME RESTIC_REPOSITORY RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY)

RIRIKO_ROOT=${RIRIKO_ROOT:-/opt/ririko}
RIRIKO_CONF=${RIRIKO_CONF:-/etc/ririko/ririko.conf}
RIRIKO_LOCK=${RIRIKO_LOCK:-/run/lock/ririko-deploy.lock}
DOCKER=${DOCKER:-docker}
CURL=${CURL:-curl}

# The secrets come only from ririko.conf, never from an ambient environment.
unset RESTIC_REPOSITORY RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
RIRIKO_ENV_FILE=""
RIRIKO_ENV_NAME=""
RESTIC_IMAGE=$DEFAULT_RESTIC_IMAGE
RESTIC_REPOSITORY=""
RESTIC_PASSWORD=""
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
BACKUP_PING_URL=""
BACKUP_LOCK_WAIT=1800

PING_URL=""
SECRETS_DIR=""
ENV_FILE=""

# --- logging and pings ------------------------------------------------------------------------

stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

log() { printf '%s %s\n' "$(stamp)" "$*"; }

# Pings the monitor (a failed ping is only a warning): ping [suffix]
ping_monitor() {
  [ -n "$PING_URL" ] || return 0
  "$CURL" -fsS -m 10 --retry 3 -o /dev/null "$PING_URL$1" ||
    log "warning: could not ping the backup monitor"
}

# Logs an error, pings <url>/fail once a ping URL is known, and exits with the given code.
fail() {
  local code=$1
  shift
  printf '%s ERROR: %s\n' "$(stamp)" "$*" >&2
  ping_monitor /fail
  exit "$code"
}

on_error() {
  local line=$1
  trap - ERR
  fail 1 "unexpected error at line $line"
}

cleanup() {
  if [ -n "$SECRETS_DIR" ]; then
    rm -rf "$SECRETS_DIR"
  fi
}

trap 'on_error $LINENO' ERR
trap cleanup EXIT

usage() {
  cat >&2 <<'EOF'
Usage: ririko-backup [run]
       ririko-backup init
EOF
  exit 2
}

# --- configuration ----------------------------------------------------------------------------

# Reads the known KEY=value lines of ririko.conf. The file is never sourced, so a stray line
# cannot run as root. Other keys (deploy, watchdog) are ignored here. A missing file is the same
# as an empty one.
load_conf() {
  [ -f "$RIRIKO_CONF" ] || return 0
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
      RIRIKO_ENV_FILE | RIRIKO_ENV_NAME | RESTIC_IMAGE | RESTIC_REPOSITORY | RESTIC_PASSWORD | \
        AWS_ACCESS_KEY_ID | AWS_SECRET_ACCESS_KEY | BACKUP_PING_URL | BACKUP_LOCK_WAIT)
        printf -v "$key" '%s' "$value"
        ;;
    esac
  done <"$RIRIKO_CONF"
  if [ -z "$RESTIC_IMAGE" ]; then
    RESTIC_IMAGE=$DEFAULT_RESTIC_IMAGE
  fi
  if [ -z "$RIRIKO_ENV_FILE" ]; then
    RIRIKO_ENV_FILE=$RIRIKO_ROOT/.env.production
  fi
}

# Prints the required keys that are not set, one per line.
missing_keys() {
  local key
  for key in "${REQUIRED_KEYS[@]}"; do
    if [ -z "${!key}" ]; then
      printf '%s\n' "$key"
    fi
  done
}

# Checks the settings that end up in a file name, a command line or a URL. The monitor URL is
# checked first, so that every later failure can ping it.
validate_conf() {
  if [ -n "$BACKUP_PING_URL" ]; then
    [[ $BACKUP_PING_URL =~ ^https://[^[:space:]]+$ ]] ||
      fail 1 "invalid BACKUP_PING_URL in $RIRIKO_CONF (it must start with https://)"
    PING_URL=${BACKUP_PING_URL%/}
  fi
  [[ $RIRIKO_ENV_NAME =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] ||
    fail 1 "invalid RIRIKO_ENV_NAME '$RIRIKO_ENV_NAME' in $RIRIKO_CONF"
  [[ $BACKUP_LOCK_WAIT =~ ^[0-9]+$ ]] ||
    fail 1 "invalid BACKUP_LOCK_WAIT '$BACKUP_LOCK_WAIT' in $RIRIKO_CONF"
  # A tag or a digest is required, and "latest" is not a pin.
  [[ $RESTIC_IMAGE =~ ^[a-z0-9][a-z0-9._/-]*(:[A-Za-z0-9._-]+|@sha256:[0-9a-f]{64})$ &&
    $RESTIC_IMAGE != *:latest ]] ||
    fail 1 "RESTIC_IMAGE '$RESTIC_IMAGE' must be pinned to a version tag or digest"
}

# --- docker -----------------------------------------------------------------------------------

# Prints the version in state/current, or nothing when no release is deployed (or it looks odd).
current_release() {
  local file=$RIRIKO_ROOT/state/current value=""
  if [ -f "$file" ]; then
    IFS= read -r value <"$file" || true
  fi
  if [[ $value =~ $VERSION_PATTERN && -d $RIRIKO_ROOT/releases/$value ]]; then
    printf '%s' "$value"
  fi
}

# docker compose for one downloaded release, with the compose files that release was deployed with
# (the same call ririko-deploy makes): compose <version> <docker compose arguments...>
compose() {
  local version=$1 dir file
  local -a names=() files=()
  shift
  dir=$RIRIKO_ROOT/releases/$version
  if [ -f "$dir/.compose-files" ]; then
    mapfile -t names <"$dir/.compose-files"
  else
    names=(docker-compose.production.yml)
  fi
  for file in "${names[@]}"; do
    files+=(-f "$dir/$file")
  done
  env RIRIKO_VERSION="$version" RIRIKO_ENV_FILE="$RIRIKO_ENV_FILE" \
    "$DOCKER" compose -p ririko "${files[@]}" --env-file "$RIRIKO_ENV_FILE" "$@"
}

# Writes the restic settings into a 0600 file in a private directory (a tmpfs under systemd), so
# the secrets are passed with --env-file and never appear on a command line.
write_restic_env() {
  SECRETS_DIR=$(mktemp -d "${RUNTIME_DIRECTORY:-${TMPDIR:-/tmp}}/ririko-backup.XXXXXX")
  ENV_FILE=$SECRETS_DIR/restic.env
  {
    printf 'RESTIC_REPOSITORY=%s\n' "$RESTIC_REPOSITORY"
    printf 'RESTIC_PASSWORD=%s\n' "$RESTIC_PASSWORD"
    printf 'AWS_ACCESS_KEY_ID=%s\n' "$AWS_ACCESS_KEY_ID"
    printf 'AWS_SECRET_ACCESS_KEY=%s\n' "$AWS_SECRET_ACCESS_KEY"
  } >"$ENV_FILE"
}

# Runs restic in the pinned image. Leading "-v source:target:ro" pairs become bind mounts:
#   restic_run [-v <mount>]... <restic arguments...>
restic_run() {
  local -a mounts=()
  while [ "${1:-}" = -v ]; do
    mounts+=(-v "$2")
    shift 2
  done
  "$DOCKER" run --rm --env-file "$ENV_FILE" "${mounts[@]}" "$RESTIC_IMAGE" "$@"
}

# --- backup -----------------------------------------------------------------------------------

# pg_dump -Fc of the running release's database into backups/nightly/ririko.dump, replacing the
# last one only when the new dump is complete. The container's own POSTGRES_USER and POSTGRES_DB
# name the database, as in ririko-deploy.
#   dump_database <running version>
dump_database() {
  local version=$1 dir out
  dir=$RIRIKO_ROOT/backups/nightly
  out=$dir/ririko.dump
  mkdir -p "$dir"
  rm -f "$dir"/*.part
  log "dumping the database to $out"
  if ! (
    # shellcheck disable=SC2016 # the variables are the container's, not ours
    compose "$version" exec -T postgres sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >"$out.part"
  ) || [ ! -s "$out.part" ]; then
    rm -f "$out.part"
    fail 1 "the database dump failed"
  fi
  mv -f "$out.part" "$out"
}

cmd_run() {
  local current volume missing weekday
  local -a mounts=() paths=()

  load_conf
  missing=$(missing_keys | paste -sd ' ' -)
  if [ -n "$missing" ]; then
    log "backup is not configured (missing in $RIRIKO_CONF: $missing); skipping"
    return 0
  fi
  current=$(current_release)
  if [ -z "$current" ]; then
    log "no release is deployed yet; skipping the backup"
    return 0
  fi
  validate_conf

  if ! { exec 9>"$RIRIKO_LOCK"; } 2>/dev/null; then
    fail 1 "cannot open the lock file $RIRIKO_LOCK"
  fi
  if ! flock -n 9; then
    log "waiting up to ${BACKUP_LOCK_WAIT}s for the lock $RIRIKO_LOCK"
    flock -w "$BACKUP_LOCK_WAIT" 9 ||
      fail 3 "the lock $RIRIKO_LOCK was not free within ${BACKUP_LOCK_WAIT}s"
  fi

  log "backup of $RIRIKO_ENV_NAME started (release $current)"
  dump_database "$current"
  # Close fd 9 (and with it the lock) before restic starts, so a deploy or the watchdog can run
  # during the upload.
  exec 9>&-
  write_restic_env

  mounts=(-v "$RIRIKO_ROOT/backups/nightly:/backup/postgres:ro")
  paths=(/backup/postgres)
  for volume in "${BACKUP_VOLUMES[@]}"; do
    mounts+=(-v "$volume:/backup/$volume:ro")
    paths+=("/backup/$volume")
  done

  log "restic backup"
  restic_run "${mounts[@]}" backup --host "$RIRIKO_ENV_NAME" "${paths[@]}" ||
    fail 1 "restic backup failed"
  log "restic forget (keep 7 daily, 4 weekly, 6 monthly)"
  restic_run forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune ||
    fail 1 "restic forget failed"
  weekday=$(date -u +%u)
  if [ "$weekday" = 7 ]; then
    log "restic check (Sunday)"
    restic_run check || fail 1 "restic check failed"
  fi

  log "backup finished"
  ping_monitor ""
}

# Creates the repository unless it exists; running it again changes nothing.
cmd_init() {
  local missing
  load_conf
  missing=$(missing_keys | paste -sd ' ' -)
  if [ -n "$missing" ]; then
    fail 1 "set these keys in $RIRIKO_CONF first: $missing"
  fi
  validate_conf
  # A manual setup step is not a nightly run, so it never pings the monitor.
  PING_URL=""
  write_restic_env
  if restic_run cat config >/dev/null 2>&1; then
    log "the restic repository $RESTIC_REPOSITORY already exists"
    return 0
  fi
  log "creating the restic repository $RESTIC_REPOSITORY"
  restic_run init || fail 1 "restic init failed"
  log "repository created; keep an offline copy of RESTIC_PASSWORD, without it no backup can be read"
}

main() {
  case ${1:-run} in
    run)
      [ $# -le 1 ] || usage
      cmd_run
      ;;
    init)
      [ $# -eq 1 ] || usage
      cmd_init
      ;;
    *) usage ;;
  esac
}

main "$@"
