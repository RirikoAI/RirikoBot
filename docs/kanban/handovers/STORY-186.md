# Handover Notes: [STORY-186] Host Deploys Apply Migrations as a Gated Step (Staging First)

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-09T18:41:41Z · claude-opus-5-5 (coordinator)

**Approach**
- Implement ADR-015 decision 9.
  - TASK-1861 adds the migration step to `ririko-deploy` and turns off migrate-on-start in the production compose file.
  - TASK-1862 writes the runbook.
- The order inside `apply_release` becomes:
  1. Pull the new images.
  2. Run `ririko db:migrate` once from the new bot image, while the old release still runs.
  3. `up -d`.
  4. `wait_ready`.

  The pre-deploy dump already comes first, in `cmd_deploy`.
- Why the old release may keep running during the migration: under the expand rule every migration leaves the schema usable by the previous release. A failed migration rolls back its own transaction, so the old release continues on an unchanged database.
- Staging adoption is an operator step after the maintainer merges. The coordinator deploys the release with the runner to staging over SSH, reads the adoption lines and `ririko-deploy status`, and records the result in a REVIEW entry here.

**Pitfalls**
- `ririko-deploy-ssh` accepts only `deploy <version>` and `status`. Keep it that way: expose no new remote command.
- A Lavalink host has no bot image. Skip the step there.

**Out of scope**
- Automatic restore of the pre-deploy dump. Restoring stays an explicit operator decision, documented in TASK-1862.

---

## REVIEW · 2026-10-10T18:32:46Z · coordinator (claude-opus-5-5) · DONE

**Children**: TASK-1861 and TASK-1862 are DONE, each with its own REVIEW entry.

**Story outcome**
- `ririko-deploy` dumps the database, runs `ririko db:migrate` from the new image while the old release keeps running, and only then starts the stack. A failed migration exits 6 and changes nothing; a refusal by the downgrade guard is named. `status` shows the migration state.
- On the hosts, `ririko-deploy` is the only schema writer (`DB_AUTO_MIGRATE=false` on every compose call). Self-hosters keep migrate-on-start (the compose default is true; maintainer decision 2026-10-11).
- `docs/release.md` 8.6 to 8.8 cover migrations on a host, restoring the pre-deploy dump, and the staging adoption checklist. `docs/deployment.md` 2.3 covers the self-hosted upgrade.

**Proof limits**: ShellCheck and the Linux run of `scripts/deploy-host.test.ts` happen in CircleCI. Locally the file shows only the known Windows `sha256sum` failure and one timing flake under load.

**Still to do for EPIC-019**: merge, then the one-time baseline adoption on staging (docs/release.md 8.8), done by the coordinator over SSH with the maintainer's go-ahead.
