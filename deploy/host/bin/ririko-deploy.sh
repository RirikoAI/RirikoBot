#!/usr/bin/env bash
# ririko-deploy: deploys one released version of Ririko on this host, or shows what runs.
# Installed as /usr/local/bin/ririko-deploy (root, 0755). The deploy user reaches it only through
# one sudoers rule, and CI reaches that user only through ririko-deploy-ssh.
#
#   ririko-deploy deploy <version>   version is X.Y.Z or X.Y.Z-prerelease
#   ririko-deploy status
#   ririko-deploy deploy <version> <instance>   Lavalink host only (RIRIKO_ROLE=lavalink)
#   ririko-deploy status [<instance>]           instance is staging or production
#
# A deploy downloads the compose files of the tagged release from GitHub (so the caller can only
# choose a published version), dumps Postgres when a release is already running, pulls the new
# images, applies the schema migrations from the new bot image (`ririko db:migrate`, ADR-015) while
# the previous release keeps running, starts the new images, and waits until the bot and the
# dashboard report ready. Every compose call below runs with DB_AUTO_MIGRATE=false in its
# environment (which wins over the host's env file), so on a host this step is the only thing that
# migrates; self-hosters who run the same compose file by hand keep migrate-on-start. When the
# migration fails nothing is started or stopped (exit 6).
# When the new release does not become ready it starts the previous release again; that is safe
# because migrations are expand-only, so the previous release runs on the migrated database
# (which is not restored). Secrets stay on the host in RIRIKO_ENV_FILE.
#
# On a Lavalink host (RIRIKO_ROLE=lavalink in ririko.conf) a deploy updates one Lavalink instance
# (container lavalink-<instance> of the compose project ririko-lavalink): it downloads
# deploy/lavalink/docker-compose.yml and docker/lavalink/application.yml of the tag into
# releases/<version>/ and compares their sha256 with state/lavalink-<instance>.sha. A restart drops
# every playing session on the instance, so when both files are unchanged it prints "unchanged"
# and leaves the container alone. Otherwise it pulls and recreates only that container (and its
# one-shot lavalink-<instance>-plugins init service, if the compose file has one), waits for
# its /version endpoint on the WireGuard address to answer 200 with the instance's password
# (LAVALINK_PASSWORD in /opt/ririko/lavalink-<instance>.env, read into a variable and given to curl
# on stdin, never on a command line), and starts the previous release of that instance again when
# it does not. The host runs only the instances named by LAVALINK_INSTANCES, or else the ones
# whose Lavalink port (production 2333, staging 2334) appears in a WG_PEERS entry.
#
# Exit codes (stable, docs/release.md and the CircleCI job rely on them):
#   0  deployed (or status printed, or the Lavalink instance was unchanged)
#   1  failed before the running release was touched (bad tag or file, dump failure, bad config)
#   2  rejected command or version, or an instance this host does not run
#   3  another deploy, backup or watchdog run holds the lock
#   4  the new release failed and the previous one was started again
#   5  the new release failed and there is no previous release to start
#   6  the database migration of the new release failed (ririko db:migrate exited 1) or was
#      refused by its downgrade guard (exit 2); the previous release was not touched
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

# The Lavalink host's project, and the two files of a release it runs from (the compose file
# mounts ../../docker/lavalink/application.yml, so the repository layout has to stay intact).
readonly LAVALINK_PROJECT=ririko-lavalink
readonly LAVALINK_FILES=(deploy/lavalink/docker-compose.yml docker/lavalink/application.yml)
readonly IPV4_PATTERN='^((25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})\.){3}(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})(/([0-9]|[12][0-9]|3[0-2]))?$'

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
DEPLOY_LOCK_WAIT=${DEPLOY_LOCK_WAIT:-300}
RIRIKO_ROLE=${RIRIKO_ROLE:-app}
WG_ADDRESS=${WG_ADDRESS:-}
WG_PEERS=${WG_PEERS:-}
LAVALINK_INSTANCES=${LAVALINK_INSTANCES:-}
LAVALINK_READY_TIMEOUT=${LAVALINK_READY_TIMEOUT:-180}
LAVALINK_PRODUCTION_HEAP=${LAVALINK_PRODUCTION_HEAP:-}
LAVALINK_STAGING_HEAP=${LAVALINK_STAGING_HEAP:-}

LOG_FILE=$RIRIKO_ROOT/deploy.log
# apply_release returns this when `ririko db:migrate` failed (anything else it returns is 1), and
# leaves the CLI's exit code in MIGRATE_STATUS. MIGRATED says a migration ran to the end.
readonly MIGRATION_FAILED=6
MIGRATE_STATUS=0
MIGRATE_ERROR=""
MIGRATED=""
COMPOSE_FILES=()
LAVALINK_BIND=""
LAVALINK_INSTANCE_LIST=()
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
Usage: ririko-deploy deploy <version> [<instance>]
       ririko-deploy status [<instance>]
(the instance, staging or production, is for a Lavalink host only)
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
      RIRIKO_REPO | RIRIKO_COMPOSE_FILES | RIRIKO_ENV_FILE | READY_TIMEOUT | DEPLOY_LOCK_WAIT | \
        RIRIKO_ROLE | WG_ADDRESS | WG_PEERS | LAVALINK_INSTANCES | LAVALINK_READY_TIMEOUT | \
        LAVALINK_PRODUCTION_HEAP | LAVALINK_STAGING_HEAP)
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
  [[ $DEPLOY_LOCK_WAIT =~ ^[0-9]+$ ]] ||
    fail 1 "invalid DEPLOY_LOCK_WAIT '$DEPLOY_LOCK_WAIT' in $RIRIKO_CONF"
  [[ $READY_POLL_SECONDS =~ ^[0-9]+(\.[0-9]+)?$ ]] ||
    fail 1 "invalid READY_POLL_SECONDS '$READY_POLL_SECONDS'"
  [[ $RIRIKO_ROLE =~ ^(app|lavalink)$ ]] ||
    fail 1 "invalid RIRIKO_ROLE '$RIRIKO_ROLE' in $RIRIKO_CONF (use app or lavalink)"
  if [ "$RIRIKO_ROLE" = lavalink ]; then
    validate_lavalink_conf
    return 0
  fi
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

# --- Lavalink host settings -------------------------------------------------------------------

# The Lavalink port of an instance (the compose file pins the same ports).
lavalink_port() {
  case $1 in
    production) printf '2333' ;;
    staging) printf '2334' ;;
  esac
}

# Prints the Lavalink instances this host runs, production first, one per line: the words of
# LAVALINK_INSTANCES (space or comma separated), or else the instances whose port is in the ports
# field of a WG_PEERS entry (<key> <ip>/32 <endpoint|-> <tcp ports>; entries separated by ";").
# Returns 1 for an unknown word. ririko-watchdog has the same function: keep them in step.
configured_instances() {
  local names=" " word entry instance
  local -a fields=() words=() ports=()
  if [ -n "$LAVALINK_INSTANCES" ]; then
    read -r -a words <<<"${LAVALINK_INSTANCES//,/ }"
    for word in "${words[@]}"; do
      case $word in
        production | staging) names+="$word " ;;
        *) return 1 ;;
      esac
    done
  else
    while IFS= read -r entry; do
      read -r -a fields <<<"$entry"
      IFS=, read -r -a ports <<<"${fields[3]:-}"
      for word in "${ports[@]}"; do
        for instance in production staging; do
          if [ "$word" = "$(lavalink_port "$instance")" ]; then
            names+="$instance "
          fi
        done
      done
    done <<<"${WG_PEERS//;/$'\n'}"
  fi
  for instance in production staging; do
    if [[ $names == *" $instance "* ]]; then
      printf '%s\n' "$instance"
    fi
  done
}

# Checks the Lavalink host's settings and fills LAVALINK_BIND (WG_ADDRESS without its prefix) and
# LAVALINK_INSTANCE_LIST.
validate_lavalink_conf() {
  local instances heap
  [[ $LAVALINK_READY_TIMEOUT =~ ^[0-9]+$ ]] ||
    fail 1 "invalid LAVALINK_READY_TIMEOUT '$LAVALINK_READY_TIMEOUT' in $RIRIKO_CONF"
  for heap in "$LAVALINK_PRODUCTION_HEAP" "$LAVALINK_STAGING_HEAP"; do
    [[ -z $heap || $heap =~ ^[0-9]+[kKmMgG]$ ]] ||
      fail 1 "invalid Lavalink heap '$heap' in $RIRIKO_CONF (use for example 768m)"
  done
  [[ $WG_ADDRESS =~ $IPV4_PATTERN ]] ||
    fail 1 "invalid or missing WG_ADDRESS '$WG_ADDRESS' in $RIRIKO_CONF (Lavalink listens on it)"
  LAVALINK_BIND=${WG_ADDRESS%%/*}
  instances=$(configured_instances) ||
    fail 1 "invalid LAVALINK_INSTANCES '$LAVALINK_INSTANCES' in $RIRIKO_CONF (use staging, production)"
  [ -n "$instances" ] ||
    fail 1 "no Lavalink instance configured: set LAVALINK_INSTANCES or give a WG_PEERS entry the port 2333 or 2334 in $RIRIKO_CONF"
  mapfile -t LAVALINK_INSTANCE_LIST <<<"$instances"
}

# Prints LAVALINK_PASSWORD of one instance from /opt/ririko/lavalink-<instance>.env (the last
# assignment wins, one pair of quotes is stripped). The file is parsed, never sourced. Returns 1
# when the file or the password is missing.
lavalink_password() {
  local file=$RIRIKO_ROOT/lavalink-$1.env line value=""
  [ -f "$file" ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    case $line in
      LAVALINK_PASSWORD=*) value=${line#LAVALINK_PASSWORD=} ;;
    esac
  done <"$file"
  if [[ $value == \"*\" && ${#value} -ge 2 ]]; then
    value=${value:1:${#value}-2}
  elif [[ $value == \'*\' && ${#value} -ge 2 ]]; then
    value=${value:1:${#value}-2}
  fi
  [ -n "$value" ] || return 1
  printf '%s' "$value"
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
# the host env file for interpolation and for the services' env_file. DB_AUTO_MIGRATE=false is set
# here, in the environment: it wins over the env file in Compose interpolation, so the bot only
# checks the schema and the deploy's own `ririko db:migrate` step is the only schema writer.
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
  env RIRIKO_VERSION="$version" RIRIKO_ENV_FILE="$RIRIKO_ENV_FILE" DB_AUTO_MIGRATE=false \
    "$DOCKER" compose -p ririko "${files[@]}" --env-file "$RIRIKO_ENV_FILE" "$@"
}

# Downloads the files of a release tag into a directory, keeping the repository layout, and checks
# that none is empty:
#   fetch_release_files <version> <directory> <repository-relative file>...
fetch_release_files() {
  local version=$1 dir=$2 file base
  shift 2
  base="https://raw.githubusercontent.com/$RIRIKO_REPO/v$version"
  log "downloading $# files of v$version from $RIRIKO_REPO"
  for file in "$@"; do
    mkdir -p "$dir/$(dirname "$file")"
    if ! "$CURL" --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      --connect-timeout 15 --max-time 120 --retry 3 --output "$dir/$file" "$base/$file"; then
      fail 1 "could not download $base/$file (is v$version published?)"
    fi
    [ -s "$dir/$file" ] || fail 1 "$base/$file is empty"
  done
}

# Downloads the files of a release tag into releases/<version>/, keeping the repository layout:
#   download_release <version> <repository-relative file>...
# Everything goes through a temporary directory, so a missing tag or file changes nothing.
download_release() {
  local version=$1 dest
  shift
  dest=$RIRIKO_ROOT/releases/$version
  TMP_DIR=$(mktemp -d "$RIRIKO_ROOT/releases/.tmp.XXXXXX")
  fetch_release_files "$version" "$TMP_DIR" "$@"
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

# True when the postgres service of a release's compose project is running.
#   postgres_running <version>
postgres_running() {
  local running
  running=$(compose "$1" ps --status running --services) && grep -qx postgres <<<"$running"
}

# Applies the schema migrations of a release with `ririko db:migrate` from its bot image, in a
# throwaway container next to the running release. --no-deps keeps compose from creating the new
# web or Lavalink containers; postgres is the one service the migration needs, so it is started
# first when nothing runs yet (a first deploy). The CLI prints what it did, which goes to the
# output and to deploy.log. Returns 1 when it fails; MIGRATE_STATUS then holds the CLI's exit
# code (1 failure, 2 refused by the downgrade guard) and MIGRATE_ERROR its last output line, and
# MIGRATED is left empty.
#   migrate_database <version>
migrate_database() {
  local version=$1 output="" line
  MIGRATE_STATUS=0
  MIGRATE_ERROR=""
  MIGRATED=""
  if ! postgres_running "$version"; then
    log "postgres is not running, starting it for the migration"
    if ! compose "$version" up -d --no-build --wait --wait-timeout "$READY_TIMEOUT" postgres; then
      log "could not start postgres for the migration"
      MIGRATE_STATUS=1
      MIGRATE_ERROR="postgres did not become healthy"
      return 1
    fi
  fi
  log "migrating the database from the $version bot image (ririko db:migrate); the running release is not touched"
  output=$(compose "$version" run --rm --no-deps -T bot ririko db:migrate </dev/null 2>&1) ||
    MIGRATE_STATUS=$?
  if [ -n "$output" ]; then
    MIGRATE_ERROR=$(tail -n 1 <<<"$output")
    while IFS= read -r line; do
      log "db:migrate: $line"
    done <<<"$output"
  fi
  if [ "$MIGRATE_STATUS" -ne 0 ]; then
    log "ririko db:migrate exited with status $MIGRATE_STATUS"
    return 1
  fi
  MIGRATED=$version
  log "the database is migrated for $version"
}

# Pulls a downloaded release, migrates the database, starts it, then waits for readiness. Returns
# MIGRATION_FAILED when the migration failed (nothing was started or stopped) and 1 on any other
# failure. A rollback passes no-migrate: the previous release runs on the database as it is
# (migrations only add, ADR-015), and its own image could not migrate it back.
#   apply_release <version> [tolerate-pull-failure] [no-migrate]
apply_release() {
  local version=$1 tolerate_pull=${2:-} no_migrate=${3:-}
  log "pulling images for $version"
  if ! compose "$version" pull; then
    if [ -z "$tolerate_pull" ]; then
      log "pull failed"
      return 1
    fi
    log "pull failed, using the images already on this host"
  fi
  if [ -z "$no_migrate" ]; then
    migrate_database "$version" || return "$MIGRATION_FAILED"
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

# --- Lavalink host ----------------------------------------------------------------------------

# docker compose for one downloaded release of the Lavalink host: project ririko-lavalink and the
# release's deploy/lavalink/docker-compose.yml. The compose file takes the listen address and the
# per-instance env files from the environment; an instance this host does not run gets /dev/null,
# so its missing env file cannot stop the one we start.
#   lavalink_compose <version> <args for docker compose>...
lavalink_compose() {
  local version=$1 instance file
  local -a env_args=("WG_ADDRESS=$LAVALINK_BIND")
  shift
  for instance in production staging; do
    file=$RIRIKO_ROOT/lavalink-$instance.env
    [ -f "$file" ] || file=/dev/null
    env_args+=("LAVALINK_${instance^^}_ENV_FILE=$file")
  done
  if [ -n "$LAVALINK_PRODUCTION_HEAP" ]; then
    env_args+=("LAVALINK_PRODUCTION_HEAP=$LAVALINK_PRODUCTION_HEAP")
  fi
  if [ -n "$LAVALINK_STAGING_HEAP" ]; then
    env_args+=("LAVALINK_STAGING_HEAP=$LAVALINK_STAGING_HEAP")
  fi
  env "${env_args[@]}" "$DOCKER" compose -p "$LAVALINK_PROJECT" \
    -f "$RIRIKO_ROOT/releases/$version/${LAVALINK_FILES[0]}" "$@"
}

# Downloads the two files the Lavalink instances run from into releases/<version>/. Both instances
# of a host share that directory, and a running container has application.yml mounted from it, so
# each file replaces its old copy with one rename and the mounted path never disappears.
download_lavalink_release() {
  local version=$1 dest file
  dest=$RIRIKO_ROOT/releases/$version
  TMP_DIR=$(mktemp -d "$RIRIKO_ROOT/releases/.tmp.XXXXXX")
  fetch_release_files "$version" "$TMP_DIR" "${LAVALINK_FILES[@]}"
  for file in "${LAVALINK_FILES[@]}"; do
    mkdir -p "$dest/$(dirname "$file")"
    mv -f "$TMP_DIR/$file" "$dest/$file"
  done
  rm -rf "$TMP_DIR"
  TMP_DIR=""
}

# Prints the sha256 line of each of the release's two Lavalink files (the content that decides
# whether an instance needs a restart).
lavalink_release_sha() {
  (cd "$RIRIKO_ROOT/releases/$1" && sha256sum "${LAVALINK_FILES[@]}")
}

# Polls GET http://<WG_ADDRESS>:<port>/version with the instance's password until it answers 200,
# or LAVALINK_READY_TIMEOUT seconds pass. The password goes to curl as a header file on stdin, so
# it is on no command line.
#   wait_lavalink <instance>
wait_lavalink() {
  local instance=$1 password code url deadline=$((SECONDS + LAVALINK_READY_TIMEOUT))
  password=$(lavalink_password "$instance") || return 1
  url="http://$LAVALINK_BIND:$(lavalink_port "$instance")/version"
  while :; do
    code=$("$CURL" --silent --output /dev/null --write-out '%{http_code}' --max-time 5 \
      --header @- "$url" 2>/dev/null <<<"Authorization: $password") || code=000
    if [ "$code" = 200 ]; then
      return 0
    fi
    if ((SECONDS >= deadline)); then
      return 1
    fi
    sleep "$READY_POLL_SECONDS"
  done
}

# Pulls and recreates only lavalink-<instance> from a downloaded release, then waits for /version.
# Returns 1 on any failure.
#   apply_lavalink <version> <instance> [tolerate-pull-failure]
apply_lavalink() {
  local version=$1 instance=$2 tolerate_pull=${3:-} service=lavalink-$2
  log "pulling the image of $service for $version"
  if ! lavalink_compose "$version" pull "$service"; then
    if [ -z "$tolerate_pull" ]; then
      log "pull failed"
      return 1
    fi
    log "pull failed, using the image already on this host"
  fi
  log "recreating $service for $version"
  # No --no-deps: the instance's own init service (lavalink-<instance>-plugins, which fixes the
  # plugin volume's owner and exits) is a dependency and has to run first. Nothing else depends on
  # or is a dependency of the instance, so the other instance is never touched.
  if ! lavalink_compose "$version" up -d "$service"; then
    log "docker compose up failed"
    return 1
  fi
  log "waiting up to ${LAVALINK_READY_TIMEOUT}s for $service to answer /version on port $(lavalink_port "$instance")"
  if ! wait_lavalink "$instance"; then
    log "$service did not answer /version with 200"
    return 1
  fi
  log "$service is ready ($version)"
}

# Container state and the last 100 log lines of one instance (also into deploy.log).
diagnose_lavalink() {
  {
    lavalink_compose "$1" ps || true
    lavalink_compose "$1" logs --no-color --tail 100 "lavalink-$2" || true
  } 2>&1 | tee -a "$LOG_FILE" || true
}

# Checks an instance word and that this host runs it (exit 2 otherwise).
require_instance() {
  local instance=$1 known
  [ -n "$instance" ] ||
    fail 2 "this is a Lavalink host: name the instance (ririko-deploy deploy <version> staging|production); the CI key's forced command does"
  [[ $instance =~ ^(staging|production)$ ]] || fail 2 "invalid instance '$instance'"
  for known in "${LAVALINK_INSTANCE_LIST[@]}"; do
    if [ "$known" = "$instance" ]; then
      return 0
    fi
  done
  fail 2 "this host does not run the $instance Lavalink instance (it runs: ${LAVALINK_INSTANCE_LIST[*]}; see LAVALINK_INSTANCES and WG_PEERS in $RIRIKO_CONF)"
}

# deploy_lavalink <version> <instance>: same order as the app deploy (settings, env file, lock,
# temporary directories, state), then the sha256 check, recreate, /version wait and rollback.
deploy_lavalink() {
  local version=$1 instance=$2 service current previous sha_state sha_new rollback_to="" env_file
  require_instance "$instance"
  service=lavalink-$instance
  env_file=$RIRIKO_ROOT/lavalink-$instance.env
  [ -f "$env_file" ] || fail 1 "env file $env_file not found"
  lavalink_password "$instance" >/dev/null ||
    fail 1 "LAVALINK_PASSWORD is empty or missing in $env_file"

  take_lock

  rm -rf "$RIRIKO_ROOT"/releases/.tmp.*
  current=$(read_state "$service.current")
  previous=$(read_state "$service.previous")
  log "$service: current=${current:-none} previous=${previous:-none}"

  download_lavalink_release "$version"
  sha_new=$(lavalink_release_sha "$version")
  sha_state=""
  if [ -f "$RIRIKO_ROOT/state/$service.sha" ]; then
    sha_state=$(<"$RIRIKO_ROOT/state/$service.sha")
  fi

  if [ "$sha_new" = "$sha_state" ] && [ -n "$current" ]; then
    log "$service: unchanged (docker-compose.yml and application.yml match $current); not restarting it, so no player is dropped"
    if [ "$current" != "$version" ]; then
      write_state "$service.previous" "$current"
    fi
    write_state "$service.current" "$version"
    log "deployed $version ($service unchanged)"
    return 0
  fi

  if [ -n "$current" ] && [ "$current" != "$version" ] && [ -d "$RIRIKO_ROOT/releases/$current" ]; then
    rollback_to=$current
  fi
  if apply_lavalink "$version" "$instance"; then
    if [ -n "$current" ] && [ "$current" != "$version" ]; then
      write_state "$service.previous" "$current"
    fi
    write_state "$service.current" "$version"
    write_state "$service.sha" "$sha_new"
    log "deployed $version ($service)"
    return 0
  fi

  log "deploy of $version to $service failed"
  diagnose_lavalink "$version" "$instance"
  if [ -n "$rollback_to" ]; then
    log "rolling $service back to $rollback_to"
    if apply_lavalink "$rollback_to" "$instance" tolerate-pull-failure; then
      log "$service rolled back to $rollback_to"
    else
      log "ROLLBACK FAILED: $service did not answer /version on $rollback_to either"
      diagnose_lavalink "$rollback_to" "$instance"
    fi
    fail 4 "deploy of $version to $service failed; rolled back to $rollback_to (its state files are unchanged)"
  fi
  fail 5 "deploy of $version to $service failed and there is no previous release to roll back to"
}

status_lavalink() {
  local only=$1 instance current previous
  local -a list=("${LAVALINK_INSTANCE_LIST[@]}")
  if [ -n "$only" ]; then
    require_instance "$only"
    list=("$only")
  fi
  for instance in "${list[@]}"; do
    current=$(read_state "lavalink-$instance.current")
    previous=$(read_state "lavalink-$instance.previous")
    log "status: lavalink-$instance current=${current:-none} previous=${previous:-none}"
    if [ -n "$current" ] && [ -f "$RIRIKO_ROOT/releases/$current/${LAVALINK_FILES[0]}" ]; then
      lavalink_compose "$current" ps "lavalink-$instance"
    fi
  done
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

# Takes the host lock shared with ririko-backup and ririko-watchdog (file descriptor 9, held until
# the script ends): first without waiting, then for up to DEPLOY_LOCK_WAIT seconds (exit 3).
take_lock() {
  if ! { exec 9>"$RIRIKO_LOCK"; } 2>/dev/null; then
    fail 1 "cannot open the lock file $RIRIKO_LOCK"
  fi
  if ! flock -n 9; then
    log "waiting up to ${DEPLOY_LOCK_WAIT}s for the lock $RIRIKO_LOCK"
    flock -w "$DEPLOY_LOCK_WAIT" 9 ||
      fail 3 "the lock $RIRIKO_LOCK was not free within ${DEPLOY_LOCK_WAIT}s"
  fi
}

cmd_deploy() {
  local version=$1 instance=${2:-} current previous dump="" rollback_to="" apply_status=0 kept=""
  [[ $version =~ $VERSION_PATTERN ]] || fail 2 "invalid version '$version'"
  if [ "$RIRIKO_ROOT" = /opt/ririko ] && [ "$(id -u)" -ne 0 ]; then
    fail 1 "ririko-deploy must run as root (through sudo)"
  fi
  mkdir -p "$RIRIKO_ROOT/releases" "$RIRIKO_ROOT/state"

  log "deploy $version requested"
  load_conf
  validate_conf
  if [ "$RIRIKO_ROLE" = lavalink ]; then
    deploy_lavalink "$version" "$instance"
    return 0
  fi
  [ -z "$instance" ] ||
    fail 2 "this host runs the app stack and takes no instance ('$instance'); RIRIKO_ROLE is not lavalink"
  [ -f "$RIRIKO_ENV_FILE" ] || fail 1 "env file $RIRIKO_ENV_FILE not found"

  take_lock

  rm -rf "$RIRIKO_ROOT"/releases/.tmp.*
  current=$(read_state current)
  previous=$(read_state previous)
  log "current=${current:-none} previous=${previous:-none}"

  download_release "$version" "${COMPOSE_FILES[@]}" "${RELEASE_EXTRA_FILES[@]}"

  if [ -n "$current" ] && [ -d "$RIRIKO_ROOT/releases/$current" ]; then
    if [ "$current" != "$version" ]; then
      rollback_to=$current
    fi
    if postgres_running "$current"; then
      dump=$(predeploy_dump "$current") || exit 1
    else
      log "postgres is not running, no pre-deploy dump"
    fi
  fi

  apply_release "$version" || apply_status=$?
  if [ "$apply_status" -eq 0 ]; then
    if [ -n "$current" ] && [ "$current" != "$version" ]; then
      write_state previous "$current"
    fi
    write_state current "$version"
    log "deployed $version"
    return 0
  fi

  dump=${dump:-none taken}
  if [ "$apply_status" -eq "$MIGRATION_FAILED" ]; then
    # Nothing of the new release was started and the running one was not touched, so there is
    # nothing to roll back.
    kept=${current:+" The previous release $current keeps running."}
    if [ "$MIGRATE_STATUS" -eq 2 ]; then
      fail 6 "the database migration of $version was refused by the downgrade guard (ririko db:migrate exit 2): the database holds a migration that this release does not know, so this release is older than the database. Last line of its output: ${MIGRATE_ERROR:-none}. Nothing was started or stopped.${kept} Deploy a newer version. Pre-deploy dump: $dump."
    fi
    fail 6 "the database migration of $version failed (ririko db:migrate exit $MIGRATE_STATUS; its output is above and in $LOG_FILE). Last line of its output: ${MIGRATE_ERROR:-none}. Nothing was started or stopped.${kept} Pre-deploy dump: $dump. Fix the cause and deploy again."
  fi

  log "deploy of $version failed"
  diagnose "$version"
  if [ -n "$MIGRATED" ]; then
    log "the database keeps the migrations of $version (they only add, so the previous release runs on them)"
  fi
  if [ -n "$rollback_to" ]; then
    log "rolling back to $rollback_to"
    if apply_release "$rollback_to" tolerate-pull-failure no-migrate; then
      log "rolled back to $rollback_to"
    else
      log "ROLLBACK FAILED: $rollback_to did not become ready either"
      diagnose "$rollback_to"
    fi
    fail 4 "deploy of $version failed; rolled back to $rollback_to (state/current is unchanged). Pre-deploy dump: $dump. The database was not restored${MIGRATED:+ and keeps the migrations of $version (they only add, so $rollback_to runs on them)}; restore it by hand only if the failed release changed data."
  fi
  fail 5 "deploy of $version failed and there is no previous release to roll back to${MIGRATED:+. The database keeps the migrations of $version}"
}

cmd_status() {
  local instance=${1:-} current previous
  load_conf
  validate_conf
  if [ "$RIRIKO_ROLE" = lavalink ]; then
    status_lavalink "$instance"
    return 0
  fi
  [ -z "$instance" ] ||
    fail 2 "this host runs the app stack and takes no instance ('$instance'); RIRIKO_ROLE is not lavalink"
  current=$(read_state current)
  previous=$(read_state previous)
  log "status: current=${current:-none} previous=${previous:-none}"
  if [ -n "$current" ] && [ -d "$RIRIKO_ROOT/releases/$current" ]; then
    compose "$current" ps
    # The CLI prints the latest, pending and unknown migration ids and always exits 0.
    if ! compose "$current" exec -T bot ririko db:migrate --status </dev/null; then
      log "status: could not read the migration status (is the bot container running?)"
    fi
  fi
}

main() {
  case ${1:-} in
    deploy)
      if [ $# -lt 2 ] || [ $# -gt 3 ]; then usage; fi
      cmd_deploy "$2" "${3:-}"
      ;;
    status)
      [ $# -le 2 ] || usage
      cmd_status "${2:-}"
      ;;
    *) usage ;;
  esac
}

main "$@"
