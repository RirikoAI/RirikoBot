#!/usr/bin/env bash
# ririko-deploy-ssh: the forced command of the deploy user's SSH key (installed as
# /usr/local/bin/ririko-deploy-ssh, see authorized_keys written by bootstrap.sh).
#
# CI can run exactly two things on the host:
#   deploy <version>   a released version, X.Y.Z or X.Y.Z-prerelease
#   status
# Anything else exits 2. The accepted words are passed to ririko-deploy through the one sudoers
# rule, as arguments (sudo resets the environment, so never through variables).
set -euo pipefail
export LC_ALL=C

# One anchored pattern for the whole line: a newline, a space or a shell character anywhere
# else makes it fail, so only the two commands above get through.
readonly ALLOWED='^(status|deploy [0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?)$'

command_line=${SSH_ORIGINAL_COMMAND-}
if [[ ! $command_line =~ $ALLOWED ]]; then
  echo "command not allowed" >&2
  exit 2
fi

read -r -a words <<<"$command_line"
exec sudo -n /usr/local/bin/ririko-deploy "${words[@]}"
