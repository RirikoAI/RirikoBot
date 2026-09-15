# RIR-003 — Docker engine startup blocker

Coordinator; observed 2026-09-15 06:21–06:26 UTC. BATCH-005 remains open; RIR-003 is blocked and retains the only execution slot. Estimate five points, confirmed in GR-007 before start. No workers. This is an incomplete operational validation, not a delivery/PR checkpoint.

## Branch and preserved history

Topic chore/RIR-003-container-validation starts at 7ed2073a1673f7a558e4a4221b6c6c20ccdee0a8 on origin/develop/2.0.0-astra. Fresh fetch verified that commit and a zero full-tree diff against PR564 reviewed head1279966b9ca33dc337f6d4c5f345da583d2167a7. Local prior receipt6281b1135d5b38cfc433115fb9a1ab55b0473b14 remains on fix/RIR-005-integration-reconciliation. Its closing board and publication/completion handoffs were restored through board sync plus exact receipt files. No implementation changes inherited beyond the integrated code, no stack, push, PR or merge.

## Checks and exact outcomes

- Docker CLI 28.4.0/API1.51; Desktop log identifies 4.46.0. Existing context desktop-linux; Linux engine named pipe missing before startup. No Docker processes were running in the initial outside-sandbox inspection.
- Started the installed Desktop executable with a hidden window. At 06:21:55 UTC its backend failed during Inference manager initialization because its dockerInference runtime socket could not be removed. The sanitized error is: initializing Inference manager; remove <LOCALAPPDATA>/Docker/run/dockerInference: The file cannot be accessed by the system.
- Exact socket inspection: zero-byte Archive/ReparsePoint object; no normal link target reported. This is observed evidence, not a proven filesystem root cause.
- docker desktop stop --timeout 20 failed with context deadline exceeded. Closed only this task's observed Desktop/backend PIDs 468,14612,24156,37332,10116,23040 after confirming their process names. No Docker processes remained in final inspection. Outstanding diagnostic commands subsequently exited with missing-engine errors.
- Attempted one non-recursive Rename-Item of that exact socket to dockerInference.RIR-003-preserved-20260915, with an existing-backup guard. Windows rejected the rename with the same inaccessible-file error. No backup was created. The socket was not deleted, and Docker settings, images, volumes, WSL distributions and disks were not changed/reset. Do not retry broader destructive recovery under this chore.
- docker compose --env-file NUL config --quiet: exit0 with explicit disposable PostgreSQL/Discord fixture variables. It validated compose.yaml without reading a deployment env file or contacting a daemon. Sandbox warnings concerned Docker user configuration access; the Compose command itself succeeded. No credentials were printed.
- node tools/workboard/cli.ts requirements-check: passed, 91 blueprint sections and 35 exact acceptance criteria; references checked, no new runtime-completion inference.
- Board/hooks: installed/check succeeded; fresh final check follows blocker transition.
- Image build/run, volume migration/persistence, runtime startup, health, doctor inside image and measured container shutdown: NOT RUN because no engine became available. Prior PR564 CI success is historical evidence only, not a substitute for these acceptance checks.

## Remaining acceptance and safe continuation

Read 001-plan.md, protocol, board and this handoff first. Preserve the branch and occupied slot. Once an engine is available, first run a bounded docker version/info and inspect context/architecture without dumping environment values. Confirm no local unknown changes and recheck the integration base. Use unique RIR-003 resource names; never reuse existing volumes.

1. Build Dockerfile target runtime from the verified source with a task-specific image tag; record source/lockfile hashes, resolved image ID and platform.
2. Validate non-root UID and absence of development/compiler dependencies in the production image. Run with read-only root, a fresh named /app/data volume, /tmp tmpfs and no external network for SQLite fixtures.
3. Explicitly migrate, run migration status and doctor --json, write a distinctive guild prefix through the compiled CLI with a dummy owner, remove/recreate only the task container and verify prefix plus audit survive in the same volume. Verify the same image can read it after restart.
4. Test missing/pending schema and absent credentials fail clearly. Exercise real compiled lifecycle with an explicitly documented offline gateway seam if feasible; assert liveness/readiness transitions and measured SIGTERM exit below the Compose 30-second grace period. Do not call an offline seam live Discord readiness.
5. Re-read persisted state after stop. Remove only exact task-created containers/volumes after evidence is saved; retain no accidental anonymous volumes. Record failures honestly and keep full live Discord/production admission gates open.
6. Record evidence in this ticket's versioned handoffs; it owns no implementation paths. A runtime defect or expanded automation/doc edit requires normal grooming/ownership, not direct board edits. On success review/done/checkpoint this single chore, prepare a bounded PR body and ask the user before publication.

Docker's supported stop CLI is documented at https://docs.docker.com/reference/cli/docker/desktop/stop/. A matching upstream report is https://github.com/docker/desktop-feedback/issues/625; it is corroborating context, not proof of this host's cause or authority for filesystem repair.

## User decision needed

Repairing Docker Desktop beyond the bounded startup recovery is a separate host-repair scope. The standing user rule in .workboard/PROTOCOL.md requires an explicit pause (revisit) or abandon (permanent) decision before a different ticket starts. Recommend pausing RIR-003 and grooming a narrowly bounded Docker repair; alternatively provide a working Docker host and resume this same ticket. No pause/abandon decision has been recorded. No factory reset, deletion, settings change, WSL shutdown/reset, disk repair or software upgrade has been authorized or attempted.

At this handoff, tracked/untracked changes are exclusively .workboard board projections and the RIR-003/RIR-005 handoffs. Commit this administrative checkpoint locally with the current blocked board. No application code changed, so no unit suite was rerun. All command sessions started by this task have finished.
