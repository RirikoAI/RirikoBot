# CHORE-2001 · bootstrap.sh Deploy-Key Summary Wording

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-10T20:59:20Z · claude-opus-5-5 (coordinator)

**Seen**: the staging bootstrap rerun on 2026-10-11 printed "CI deploy key: NOT installed (run again with --deploy-key)" although it kept the existing key.

**Approach**: find the summary in `deploy/host/bootstrap.sh`: grep "NOT installed", and the `authorized_keys` handling near lines 345 to 365. Detect an existing `restrict,command="/usr/local/bin/ririko-deploy-ssh` line.

---

## GROOMING · 2026-10-19T16:15:00Z · claude-opus-5-5 (coordinator) · details for the worker

**Relevant code** (checked today)
- `deploy/host/bootstrap.sh:381-389`: the deploy user's `authorized_keys` is written only when a `--deploy-key*` option is given. Otherwise it is left as it is (`log 'no deploy key option: ...'`). The home directory comes from `getent passwd deploy | cut -d: -f6`.
- `deploy/host/bootstrap.sh:640-646` `print_next_steps`: for the app role, `key_state` is `installed` when `$DEPLOY_KEY` is set and `NOT installed (run again with --deploy-key)` otherwise. That is the bug: a kept key is reported as missing.
- `scripts/deploy-host.test.ts:2553-2571`: the pattern for testing one bootstrap function. A regex extracts the function body from `bootstrap.sh`, then `runBash` runs it with the variables set and a `mktemp -d` work directory. Reuse it.

**Approach**
1. Add a small function `deploy_key_state <authorized_keys file>` next to `render_deploy_authorized_keys`. It prints `installed` when `$DEPLOY_KEY` is set. It prints `kept (already installed)` when the file exists and holds a line starting with `restrict,command="/usr/local/bin/ririko-deploy-ssh"`. Otherwise it prints `NOT installed (run again with --deploy-key)`. Use `grep -qs '^restrict,command="/usr/local/bin/ririko-deploy-ssh' "$1"`, which is quiet when the file is missing.
2. In `print_next_steps`, app role: `key_state=$(deploy_key_state "$(getent passwd deploy | cut -d: -f6)/.ssh/authorized_keys")`.
3. Tests: a `describe('deploy_key_state')` block in the same style as `render_deploy_authorized_keys`, with three cases: key option set, file with a forced-command line and no option, no file and no option. Add a fourth case with a file that holds only a plain key with no forced command, which still reports `NOT installed`. Add a check that `print_next_steps` calls `deploy_key_state`.

**Pitfalls**
- `bootstrap.sh` runs under `set -euo pipefail`. A `grep` with no match returns 1, so use it only inside `if`.
- The lavalink role summary (`left as it is`) is out of scope.
- `pnpm vitest run scripts/deploy-host.test.ts` needs `--testTimeout=120000` as in `verify_cmd`. Some tests spawn real shells.

---

## PROGRESS · 2026-10-19T16:03:09Z · claude-small (claude-haiku-5-5, small tier) · REVIEW

**Files changed**
- `deploy/host/bootstrap.sh`: new `deploy_key_state <authorized_keys file>` after `render_deploy_authorized_keys` (line 365 onward). It prints `installed` when `$DEPLOY_KEY` is set, `kept (already installed)` when the file has a line starting `restrict,command="/usr/local/bin/ririko-deploy-ssh" `, and `NOT installed (run again with --deploy-key)` otherwise. `print_next_steps` (app role, line 661) now sets `key_state` from `deploy_key_state "$home/.ssh/authorized_keys"`, with `home` from `getent passwd deploy`, as the GROOMING entry said.
- `scripts/deploy-host.test.ts`: a `describe('deploy_key_state')` block (after `render_deploy_authorized_keys`, in `bootstrap.sh roles`) with 6 tests: the function is found, the key option gives `installed`, a forced-command file gives `kept`, no file and no option gives `NOT installed`, a plain key with no forced command gives `NOT installed`, a lavalink context line gives `NOT installed`, and `print_next_steps` calls the helper.
- Not changed: the lavalink summary, `setup_deploy_user`, and every other file. `context.files` is unchanged.

**Verification**
- `pnpm vitest run scripts/deploy-host.test.ts --testTimeout=120000`: 311 passed, 1 skipped (the `nft -c` test, which needs root and nft). All 6 new tests pass.
- `pnpm format:check`: pass.
- `pnpm lint --quiet`: pass.
- `bash -n deploy/host/bootstrap.sh`: pass.
- ShellCheck (CircleCI lint job) was NOT run: it is not installed in this container. The coordinator should run it, or CI will.
- Git: no commit, no push, no branch. Working tree has other uncommitted changes from other work, which this ticket did not touch.

**Decisions & gotchas**
- The GROOMING entry suggested matching `^restrict,command="/usr/local/bin/ririko-deploy-ssh` with no closing quote. I matched `...ririko-deploy-ssh" ` (closing quote and a space) instead. The shorter prefix also matches the lavalink context lines (`...ririko-deploy-ssh staging" `), which are not the app role's key. The app role is the only role whose summary uses this helper.
- The grep is in an `if`, so `set -euo pipefail` does not stop on a no-match exit code. A missing file prints nothing because of `-s`.
- CodeGraph was unavailable in this container, as the coordinator's environment note said. Starting points came from `context.files` and the GROOMING line ranges, read with ranged Reads. Grep was used for two lookups (`shQuote`/`wgBash` definitions and `print_next_steps` references) after the ranged Reads did not locate them.

**New CodeGraph queries**
- None. CodeGraph was not available.

**Next steps**
- Coordinator review: rerun `verify_cmd`, run ShellCheck on `deploy/host/bootstrap.sh` if it is available, check the diff against the acceptance items, and write the `REVIEW · … · DONE` entry.
- Commit and push only after the user confirms (section 1.7). Workers do not commit.

---

## REVIEW · 2026-10-19T16:40:00Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**: passes (311 passed, 1 skipped, `format:check`, `lint --quiet`). `bash -n` passes. ShellCheck could not be installed in this container, so CircleCI's `lint` job is the first to run it. The new code declares `local key_state home` before it assigns, so SC2155 does not apply.

**Worker tier**: small (Haiku), matches.

**Acceptance**
- [x] 1: `deploy_key_state` prints `installed` with `--deploy-key`, `kept (already installed)` when `authorized_keys` holds the app forced-command line, and the NOT installed hint otherwise. `print_next_steps` uses it for the app role. Matching on the closing quote and a space is stricter than the grooming text and correct: a lavalink context line (`ririko-deploy-ssh staging`) is not the app key.
- [x] 2: tests cover the three cases, plus a plain key, a lavalink line and the `print_next_steps` wiring.

**Outcome**: DONE.
