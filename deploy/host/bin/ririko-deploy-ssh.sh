#!/usr/bin/env bash
# ririko-deploy-ssh: the forced command of the deploy user's SSH key (installed as
# /usr/local/bin/ririko-deploy-ssh, see authorized_keys written by bootstrap.sh).
#
# CI can run exactly two things on the host:
#   deploy <version>   a released version, X.Y.Z or X.Y.Z-prerelease
#   status
# Anything else exits 2. The accepted words are passed to ririko-deploy through the one sudoers
# rule, as arguments (sudo resets the environment, so never through variables).
#
# Lavalink host (RIRIKO_ROLE=lavalink in ririko.conf): one host runs several instances, so every
# CI key is forced to its own instance, "ririko-deploy-ssh staging" or "ririko-deploy-ssh
# production" (bootstrap.sh --role lavalink writes those lines). The instance is the first
# argument of this script, set by the root-owned authorized_keys line, and never part of
# SSH_ORIGINAL_COMMAND, so a key cannot pick another instance. It is appended to the words, and
# ririko-deploy (root, which reads ririko.conf; the deploy user cannot) checks that the role
# and the instance fit: a Lavalink host refuses a missing instance and an app host refuses one.
set -euo pipefail
export LC_ALL=C

# One anchored pattern for the whole line: a newline, a space or a shell character anywhere
# else makes it fail, so only the two commands above get through.
readonly ALLOWED='^(status|deploy [0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?)$'
readonly INSTANCE_ALLOWED='^(staging|production)$'

instance=${1-}
if [[ -n $instance && ! $instance =~ $INSTANCE_ALLOWED ]]; then
  echo "instance not allowed" >&2
  exit 2
fi

command_line=${SSH_ORIGINAL_COMMAND-}
if [[ ! $command_line =~ $ALLOWED ]]; then
  echo "command not allowed" >&2
  exit 2
fi

read -r -a words <<<"$command_line"
if [[ -n $instance ]]; then
  words+=("$instance")
fi
exec sudo -n /usr/local/bin/ririko-deploy "${words[@]}"
