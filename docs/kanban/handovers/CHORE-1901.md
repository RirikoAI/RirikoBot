# CHORE-1901 · Runbook: Rerun bootstrap.sh Before the First Deploy With the Migration Runner

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-10T20:25:16Z · claude-opus-5-5 (coordinator)

**What happened on staging (2026-10-11)**
- rc.6 deployed with the host's `ririko-deploy` from 2026-10-07. That version has no `db:migrate` step, so `deploy.log` had no "migrating the database" line.
- The bot's default `DB_AUTO_MIGRATE=true` adopted the database at startup instead. It added nothing and gave no notes.
- The coordinator then ran `bootstrap.sh --ref v2.0.0-rc.6` on the host, which rewrote only `/usr/local/bin/ririko-deploy`.
- rc.7 then ran the gated step: "migrating the database from the 2.0.0-rc.7 bot image", then "Applied 1 migration(s): 0001_welcomer_text_message", then "the database is migrated". The bot logged "DB_AUTO_MIGRATE is false".

**Approach**
- This is docs only. Write the step as the hosting runbook writes it, but with placeholders (`<ref>`, `ssh-staging.<domain>`).
- To make it repeatable, run bootstrap as a transient systemd unit: `systemd-run --unit=ririko-bootstrap --collect bash bootstrap.sh --ref <ref>`. Then a tunnel drop cannot stop it halfway. Then read it with `journalctl -u ririko-bootstrap`.

**Pitfalls**
- `docs/hosting.md` is private and git-ignored. Do not reference its live values.

---

## PROGRESS · 2026-10-10T20:29:10Z · claude-small (claude-haiku-5-5) · REVIEW

**Files changed**
- `docs/release.md`: section 8.6 gets one sentence that host scripts (`/usr/local/bin/ririko-deploy` and the rest of `deploy/host/bin`) reach a host only through `bootstrap.sh --ref <ref>`, so a release that changes them needs that step on every host before its deploy. Section 8.8 gets a step 0 before the manual dump: rerun `bootstrap.sh` as root with `--ref <ref>` (the transient `systemd-run --unit=ririko-bootstrap --collect` form from the grooming is given too, with `journalctl -u ririko-bootstrap` to read it), then check `grep -c db:migrate /usr/local/bin/ririko-deploy` prints a number above 0. The step says a deploy never updates host scripts, and that a deploy with old host scripts is still safe (adopt and migrate at startup, readiness rollback on failure, exit 4) but is not the gated path.
- `docs/deployment.md`: the two places that describe `ririko-deploy` (section 2.2 and section 2.3) link section 8.6 for the host-script rule.
- `docs/kanban/board.json`: CHORE-1901 claimed (`IN_PROGRESS`, `assignee`, `claimed_at`), then set to `REVIEW` with `assignee` and `claimed_at` cleared.
- `docs/kanban/BOARD.md`: rendered by `scripts/kanban/render-board.mjs`.
- `docs/kanban/handovers/CHORE-1901.md`: this entry.

**Verification**
- `verify_cmd` (`pnpm format:check && pnpm lint --quiet`): both pass (format: "All matched files use Prettier code style!"; lint exit 0).
- Acceptance 1: step 0 in `docs/release.md` 8.8 with the rerun, the `grep -c db:migrate` check, and the "a deploy never updates them" and "still safe, not the gated path" notes.
- Acceptance 2: one sentence in `docs/release.md` 8.6 on `deploy/host/bin` and `bootstrap.sh`.
- Acceptance 3: `docs/deployment.md` links `release.md#86-migrations-on-a-host` where it describes `ririko-deploy`. Placeholders only (`<ref>`, `<path-to>`).
- Privacy scan of the added lines: no IP addresses, no domains, no provider or region names. `docs/hosting.md` was not read.
- No commit, no push, no branch change. The `.idea/vcs.xml` change and the other EPIC-019 close-out edits are untouched.

**Decisions & gotchas**
- The `bootstrap.sh` command uses `<path-to>/bootstrap.sh` as a placeholder. The exact host path and the full command live in the private hosting runbook (not read here), so the public text does not depend on a host layout.
- The `systemd-run` form follows the grooming approach. It was not run on any host (worker had no host access by design).
- The `grep -c db:migrate` check matches the string as the grooming acceptance wrote it. The source of `deploy/host/bin/ririko-deploy.sh` contains `db:migrate`, and `bootstrap.sh` installs it to `/usr/local/bin/$name`.

**New CodeGraph queries**
- None beyond the ticket's `ririko-deploy migrate_database apply_release` (the result was the migrate path in `packages/database` and `apps/bot/src/database-startup.ts`, which the docs already describe).

**Next steps**
- Coordinator: review the diff of `docs/release.md` and `docs/deployment.md`, rerun `pnpm format:check && pnpm lint --quiet`, check the acceptance items, and write the `REVIEW · … · DONE` entry.

---

## REVIEW · 2026-10-10T20:30:30Z · coordinator (claude-opus-5-5) · DONE

**verify_cmd rerun**
- `pnpm format:check && pnpm lint --quiet`: pass.

**Acceptance**
- [x] `docs/release.md` 8.8 step 0: rerun `bootstrap.sh --ref <ref>` as root (optionally as a `systemd-run --collect` unit, read with `journalctl`), then check `grep -c db:migrate /usr/local/bin/ririko-deploy`. It explains why, and that skipping it is safe but not the gated path. This matches what the coordinator ran on staging on 2026-10-11.
- [x] 8.6 has the rule: `deploy/host/bin` reaches a host only through `bootstrap.sh`.
- [x] `docs/deployment.md` 2.2 and 2.3 link it. Placeholders only, no host details.

**Worker tier**
- claude-small (claude-haiku-5-5) matches `small`.
