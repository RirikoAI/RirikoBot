#!/usr/bin/env bash
# ririko-watchdog: restarts unhealthy containers and keeps a heartbeat monitor fed while the stack
# is healthy. Installed as /usr/local/bin/ririko-watchdog (root, 0755) and started every minute by
# ririko-watchdog.timer.
#
# Docker restarts a container that exits, but not one that keeps running while its HEALTHCHECK
# fails, and nothing tells anybody. Each run looks at the containers of the compose project
# "ririko" (containers of other projects, such as ririko-lavalink, are ignored):
#
#   1. a container whose health is "unhealthy" is restarted with docker restart and logged
#      through logger (a container that is still "starting" is left alone);
#   2. the stack is healthy when bot, web and postgres are running and report healthy, and
#      lavalink, if it is part of the project at all, is running (the Lightsail hosts use the
#      remote Lavalink node, so they have none), and nothing was unhealthy in this run;
#   3. a healthy stack on a root file system below DISK_ALERT_PERCENT pings HEALTHCHECK_PING_URL;
#      anything else posts a one-line reason to <HEALTHCHECK_PING_URL>/fail. While the stack is
#      only starting (after a boot or a restart) it sends neither, and the monitor's grace period
#      decides. Without a URL the script only logs.
#
# Healthchecks.io (or a similar service) alerts when the pings stop, so a dead host or a failed
# run alerts as well: silence means trouble. Give the check a 1-minute period and a few minutes
# of grace.
#
# The deploy lock (RIRIKO_LOCK, shared with ririko-deploy and ririko-backup) is taken without
# waiting while the containers are inspected and restarted. When it is held, a deploy or a backup
# dump is running: the script logs one line and exits 0 without restarting or pinging anything.
# The lock is released before the ping.
#
# bootstrap.sh starts the timer on every host, also before ririko.conf is filled in and before the
# first deploy. With no container of the project it logs one line and exits 0 without a ping.
#
# Exit codes:
#   0  checked (healthy or not), or skipped (lock held, no stack deployed, stack still starting)
#   1  could not check (Docker unreachable, lock file unusable) or invalid configuration
#   2  rejected command line
#
# Settings come from /etc/ririko/ririko.conf (see deploy/host/ririko.conf.example), which is parsed
# for known keys and never sourced. RIRIKO_CONF, RIRIKO_LOCK, DOCKER, CURL, DF and LOGGER can be
# overridden through the environment for tests.
set -Eeuo pipefail
export LC_ALL=C

readonly PROJECT=ririko
readonly REQUIRED_SERVICES=(bot web postgres)
readonly TAG=ririko-watchdog

RIRIKO_CONF=${RIRIKO_CONF:-/etc/ririko/ririko.conf}
RIRIKO_LOCK=${RIRIKO_LOCK:-/run/lock/ririko-deploy.lock}
DOCKER=${DOCKER:-docker}
CURL=${CURL:-curl}
DF=${DF:-df}
LOGGER=${LOGGER:-logger}

HEALTHCHECK_PING_URL=""
DISK_ALERT_PERCENT=85

PING_URL=""
CONF_ERROR=0

# --- logging and pings ------------------------------------------------------------------------

stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

log() { printf '%s %s\n' "$(stamp)" "$*"; }

# Logs a line to stdout (the journal of the service) and through logger, for the events somebody
# may search for later.
note() {
  log "$*"
  "$LOGGER" -t "$TAG" -p daemon.warning -- "$*" || true
}

# Logs an error and exits with the given code.
fail() {
  local code=$1
  shift
  printf '%s ERROR: %s\n' "$(stamp)" "$*" >&2
  exit "$code"
}

on_error() {
  local line=$1
  trap - ERR
  fail 1 "unexpected error at line $line"
}

trap 'on_error $LINENO' ERR

usage() {
  cat >&2 <<'EOF'
Usage: ririko-watchdog
EOF
  exit 2
}

# Pings the monitor; a failing ping is only a warning: ping_monitor [<suffix> [<reason>]]
ping_monitor() {
  local suffix=${1:-}
  local -a data=()
  [ -n "$PING_URL" ] || return 0
  if [ -n "${2:-}" ]; then
    data=(--data-raw "$2")
  fi
  "$CURL" -fsS -m 10 --retry 3 -o /dev/null "${data[@]}" "$PING_URL$suffix" ||
    log "warning: could not ping the heartbeat monitor"
}

# --- configuration ----------------------------------------------------------------------------

# Reads the known KEY=value lines of ririko.conf. The file is never sourced, so a stray line
# cannot run as root. Other keys (deploy, backup) are ignored here. A missing file is the same as
# an empty one.
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
      HEALTHCHECK_PING_URL | DISK_ALERT_PERCENT)
        printf -v "$key" '%s' "$value"
        ;;
    esac
  done <"$RIRIKO_CONF"
  if [ -z "$DISK_ALERT_PERCENT" ]; then
    DISK_ALERT_PERCENT=85
  fi
}

# Checks the two settings. An invalid one does not stop the restarts: the script reports it,
# works with a safe value, and exits 1 at the end.
validate_conf() {
  if [ -n "$HEALTHCHECK_PING_URL" ]; then
    if [[ $HEALTHCHECK_PING_URL =~ ^https://[^[:space:]]+$ ]]; then
      PING_URL=${HEALTHCHECK_PING_URL%/}
    else
      printf '%s ERROR: invalid HEALTHCHECK_PING_URL in %s (it must start with https://); not pinging\n' \
        "$(stamp)" "$RIRIKO_CONF" >&2
      CONF_ERROR=1
    fi
  fi
  if ! [[ $DISK_ALERT_PERCENT =~ ^[0-9]+$ ]] || ((10#$DISK_ALERT_PERCENT < 1 || 10#$DISK_ALERT_PERCENT > 100)); then
    printf '%s ERROR: invalid DISK_ALERT_PERCENT %s in %s (use 1 to 100); using 85\n' \
      "$(stamp)" "$DISK_ALERT_PERCENT" "$RIRIKO_CONF" >&2
    DISK_ALERT_PERCENT=85
    CONF_ERROR=1
  fi
  DISK_ALERT_PERCENT=$((10#$DISK_ALERT_PERCENT))
}

# --- checks -----------------------------------------------------------------------------------

# Prints "<status> <health>" of one container; the health is empty without a HEALTHCHECK.
container_state() {
  "$DOCKER" inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$1"
}

# Prints the use of the root file system in percent (a number).
disk_percent() {
  local out
  out=$("$DF" --output=pcent /)
  printf '%s\n' "$out" | tail -n 1 | tr -dc '0-9'
}

# Joins the arguments with "; ".
join_reasons() {
  local out="" item
  for item in "$@"; do
    out=${out:+$out; }$item
  done
  printf '%s' "$out"
}

main() {
  [ $# -eq 0 ] || usage

  local listing name service state status health percent reason
  local -a reasons=() starting=()
  local -A seen_status=() seen_health=()

  if ! { exec 9>"$RIRIKO_LOCK"; } 2>/dev/null; then
    fail 1 "cannot open the lock file $RIRIKO_LOCK"
  fi
  if ! flock -n 9; then
    log "a deploy or a backup holds $RIRIKO_LOCK; skipping this check"
    return 0
  fi

  load_conf
  validate_conf

  # Names and services of every container of the project, running or not. A missing Docker
  # daemon is a failure, and the monitor alerts because the pings stop.
  listing=$("$DOCKER" ps -a --filter "label=com.docker.compose.project=$PROJECT" \
    --format '{{.Names}} {{.Label "com.docker.compose.service"}}') ||
    fail 1 "docker ps failed; cannot check the stack"
  if [ -z "$listing" ]; then
    log "no containers of the compose project $PROJECT; nothing deployed yet, skipping"
    exit "$CONF_ERROR"
  fi

  while read -r name service; do
    [ -n "$name" ] || continue
    state=$(container_state "$name") || {
      reasons+=("cannot inspect $service")
      continue
    }
    read -r status health <<<"$state"
    # A service can have several containers (scaled); the worst one counts.
    if [ "$health" = unhealthy ]; then
      note "restarting unhealthy container $name (service $service)"
      if "$DOCKER" restart "$name" >/dev/null; then
        reasons+=("$service was unhealthy and was restarted")
      else
        note "could not restart container $name"
        reasons+=("$service is unhealthy and could not be restarted")
      fi
      status=restarted
      health=""
    elif [ "$status" = running ] && [ "$health" = starting ]; then
      starting+=("$service")
    fi
    if [ -z "${seen_status[$service]:-}" ] || [ "$status" != running ] || [ "$health" = starting ]; then
      seen_status[$service]=$status
      seen_health[$service]=$health
    fi
  done <<<"$listing"

  for service in "${REQUIRED_SERVICES[@]}"; do
    if [ -z "${seen_status[$service]:-}" ]; then
      reasons+=("$service is missing")
    elif [ "${seen_status[$service]}" = restarted ]; then
      : # already reported above
    elif [ "${seen_status[$service]}" != running ]; then
      reasons+=("$service is ${seen_status[$service]}")
    elif [ "${seen_health[$service]}" != healthy ] && [ "${seen_health[$service]}" != starting ]; then
      reasons+=("$service reports ${seen_health[$service]:-no health}")
    fi
  done
  if [ -n "${seen_status[lavalink]:-}" ] && [ "${seen_status[lavalink]}" != running ] &&
    [ "${seen_status[lavalink]}" != restarted ]; then
    reasons+=("lavalink is ${seen_status[lavalink]}")
  fi

  percent=$(disk_percent)
  if [ -z "$percent" ]; then
    reasons+=("cannot read the disk usage")
  elif ((percent >= DISK_ALERT_PERCENT)); then
    reasons+=("root file system is ${percent}% full (limit ${DISK_ALERT_PERCENT}%)")
  fi

  # The deploy lock is only needed while containers are inspected and restarted.
  exec 9>&-

  if ((${#reasons[@]} > 0)); then
    reason=$(join_reasons "${reasons[@]}")
    note "stack not healthy: $reason"
    ping_monitor /fail "$reason"
  elif ((${#starting[@]} > 0)); then
    log "stack is still starting (${starting[*]}); no ping yet"
  else
    log "stack healthy; root file system ${percent}% full"
    ping_monitor
  fi
  exit "$CONF_ERROR"
}

main "$@"
