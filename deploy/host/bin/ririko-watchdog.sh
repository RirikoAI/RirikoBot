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
# Lavalink host (RIRIKO_ROLE=lavalink in ririko.conf): the project is "ririko-lavalink" and its
# containers have no HEALTHCHECK, so the host is healthy when every configured instance
# (LAVALINK_INSTANCES, or the instances whose port 2333 or 2334 a WG_PEERS entry names) has a
# running container lavalink-<instance> and GET http://<WG_ADDRESS>:<port>/version answers 200 with
# the instance's password (LAVALINK_PASSWORD in /opt/ririko/lavalink-<instance>.env, given to curl
# on stdin, never on a command line), and the disk has room. The one-shot init services
# (lavalink-<instance>-plugins, exited 0 by design) are ignored. A failed check is counted in
# /opt/ririko/state/watchdog-lavalink-<instance>; the third consecutive failure restarts that
# container (docker restart) and resets the counter, and the next 3 minutes of failures are needed
# before it is restarted again, which leaves the JVM time to start. Every failed check still posts
# /fail with the reason.
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
readonly LAVALINK_PROJECT=ririko-lavalink
# Consecutive failed checks of a Lavalink instance before it is restarted.
readonly LAVALINK_RESTART_AFTER=3
readonly IPV4_PATTERN='^((25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})\.){3}(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})(/([0-9]|[12][0-9]|3[0-2]))?$'

RIRIKO_ROOT=${RIRIKO_ROOT:-/opt/ririko}
RIRIKO_CONF=${RIRIKO_CONF:-/etc/ririko/ririko.conf}
RIRIKO_LOCK=${RIRIKO_LOCK:-/run/lock/ririko-deploy.lock}
DOCKER=${DOCKER:-docker}
CURL=${CURL:-curl}
DF=${DF:-df}
LOGGER=${LOGGER:-logger}

HEALTHCHECK_PING_URL=""
DISK_ALERT_PERCENT=85
RIRIKO_ROLE=app
WG_ADDRESS=""
WG_PEERS=""
LAVALINK_INSTANCES=""

PING_URL=""
CONF_ERROR=0
LAVALINK_BIND=""
LAVALINK_INSTANCE_LIST=()
reasons=()
starting=()

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
      HEALTHCHECK_PING_URL | DISK_ALERT_PERCENT | RIRIKO_ROLE | WG_ADDRESS | WG_PEERS |         LAVALINK_INSTANCES)
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
  [[ $RIRIKO_ROLE =~ ^(app|lavalink)$ ]] ||
    fail 1 "invalid RIRIKO_ROLE '$RIRIKO_ROLE' in $RIRIKO_CONF (use app or lavalink)"
  if [ "$RIRIKO_ROLE" = lavalink ]; then
    validate_lavalink_conf
  fi
}

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
# Returns 1 for an unknown word. ririko-deploy has the same function: keep them in step.
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

# Fills LAVALINK_BIND (WG_ADDRESS without its prefix) and LAVALINK_INSTANCE_LIST. Without them
# nothing can be checked, so a bad value is a failed run (exit 1: the pings stop and the monitor
# alerts).
validate_lavalink_conf() {
  local instances
  [[ $WG_ADDRESS =~ $IPV4_PATTERN ]] ||
    fail 1 "invalid or missing WG_ADDRESS '$WG_ADDRESS' in $RIRIKO_CONF (Lavalink listens on it)"
  LAVALINK_BIND=${WG_ADDRESS%%/*}
  instances=$(configured_instances) ||
    fail 1 "invalid LAVALINK_INSTANCES '$LAVALINK_INSTANCES' in $RIRIKO_CONF (use staging, production)"
  [ -n "$instances" ] ||
    fail 1 "no Lavalink instance configured: set LAVALINK_INSTANCES or give a WG_PEERS entry the port 2333 or 2334 in $RIRIKO_CONF"
  mapfile -t LAVALINK_INSTANCE_LIST <<<"$instances"
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

# Prints LAVALINK_PASSWORD of one instance from /opt/ririko/lavalink-<instance>.env (the last
# assignment wins, one pair of quotes is stripped). The file is parsed, never sourced. Returns 1
# when the file or the password is missing. ririko-deploy has the same function.
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

# Succeeds when GET http://<WG_ADDRESS>:<port>/version answers 200 for the instance's password.
# The password goes to curl as a header file on stdin, so it is on no command line.
lavalink_version_ok() {
  local password code
  password=$(lavalink_password "$1") || return 1
  code=$("$CURL" --silent --output /dev/null --write-out '%{http_code}' --max-time 5     --header @- "http://$LAVALINK_BIND:$(lavalink_port "$1")/version" 2>/dev/null     <<<"Authorization: $password") || return 1
  [ "$code" = 200 ]
}

# Joins the arguments with "; ".
join_reasons() {
  local out="" item
  for item in "$@"; do
    out=${out:+$out; }$item
  done
  printf '%s' "$out"
}

# Reads the failure counter of a Lavalink instance (digits, 0 when there is none).
lavalink_failures() {
  local file=$RIRIKO_ROOT/state/watchdog-lavalink-$1 value=""
  if [ -f "$file" ]; then
    IFS= read -r value <"$file" || true
  fi
  if [[ $value =~ ^[0-9]{1,6}$ ]]; then
    printf '%s' "$((10#$value))"
  else
    printf '0'
  fi
}

# Counts a failed check of one instance in watchdog-lavalink-<instance>, or clears the counter:
#   lavalink_record <instance> <failed|ok>
lavalink_record() {
  local file=$RIRIKO_ROOT/state/watchdog-lavalink-$1
  if [ "$2" = ok ]; then
    rm -f "$file"
    return 0
  fi
  mkdir -p "$RIRIKO_ROOT/state"
  printf '%s\n' "$(($(lavalink_failures "$1") + 1))" >"$file"
}

# The Lavalink host's checks (see the header): fills reasons[] for finish().
check_lavalink() {
  local listing instance service name state status problem failures
  local -A container=()
  listing=$("$DOCKER" ps -a --filter "label=com.docker.compose.project=$LAVALINK_PROJECT"     --format '{{.Names}} {{.Label "com.docker.compose.service"}}') ||
    fail 1 "docker ps failed; cannot check the Lavalink containers"
  if [ -z "$listing" ]; then
    log "no containers of the compose project $LAVALINK_PROJECT; nothing deployed yet, skipping"
    exit "$CONF_ERROR"
  fi
  while read -r name service; do
    # lavalink-<instance>-plugins is a one-shot init service (it fixes the plugin volume's owner
    # and exits 0): an exited container is its normal state, never a broken instance.
    if [[ $service == *-plugins ]]; then
      continue
    fi
    if [ -n "$name" ] && [ -z "${container[$service]:-}" ]; then
      container[$service]=$name
    fi
  done <<<"$listing"

  for instance in "${LAVALINK_INSTANCE_LIST[@]}"; do
    service=lavalink-$instance
    name=${container[$service]:-}
    problem=""
    if [ -z "$name" ]; then
      problem="$service is missing"
    elif ! state=$(container_state "$name"); then
      problem="cannot inspect $service"
    else
      read -r status _ <<<"$state"
      if [ "$status" != running ]; then
        problem="$service is $status"
      elif ! lavalink_version_ok "$instance"; then
        problem="$service does not answer /version"
      fi
    fi

    if [ -z "$problem" ]; then
      lavalink_record "$instance" ok
      continue
    fi
    lavalink_record "$instance" failed
    failures=$(lavalink_failures "$instance")
    if [ -n "$name" ] && ((failures >= LAVALINK_RESTART_AFTER)); then
      note "restarting $service (container $name): $problem in $failures checks in a row"
      if "$DOCKER" restart "$name" >/dev/null; then
        lavalink_record "$instance" ok
        reasons+=("$problem; restarted after $failures failed checks")
      else
        note "could not restart container $name"
        reasons+=("$problem; could not be restarted")
      fi
    else
      reasons+=("$problem (failed check $failures of $LAVALINK_RESTART_AFTER)")
    fi
  done
}

# The tail of every run: the disk check, the lock released, then the heartbeat or /fail ping.
finish() {
  local percent reason
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

main() {
  [ $# -eq 0 ] || usage

  local listing name service state status health
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

  if [ "$RIRIKO_ROLE" = lavalink ]; then
    check_lavalink
    finish
  fi

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

  finish
}

main "$@"
