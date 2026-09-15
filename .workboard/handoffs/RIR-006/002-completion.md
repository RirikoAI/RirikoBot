# RIR-006 — recovered Docker engine and verified clean relaunch

Coordinator, 2026-09-15, final verification 06:37:58 UTC. Five-point bug in BATCH-006; topic fix/RIR-006-docker-engine, integration base7ed2073a1673f7a558e4a4221b6c6c20ccdee0a8. User approved pause of RIR-003 and separate repair. D-008 pauses it for later; D-009 defers its incomplete publication. Prior branch retained at2d3328e. No workers. Read protocol, board, 001-plan.md and RIR-003 handoffs.

## Outcome and repair

Docker Desktop4.46.0 / Engine28.4.0 / API1.51 is running on Linux amd64, WSL kernel6.6.87.2. Windows reports build26200. The prior inaccessible endpoint failure was reproduced and recovered without modifying application code, Docker settings, persistent disks or existing containers/volumes.

Initial stopped runtime directory C:/Users/damna/AppData/Local/Docker/run was an ordinary directory containing exactly two zero-byte Archive/ReparsePoint endpoints: dockerInference and userAnalyticsOtlpHttp.sock. fsutil reparsepoint query returned error1920. Single-file rename had already failed. With all Docker processes stopped, exact paths resolved and same-parent destinations checked, preserved the directory as run.RIR-006-preserved-20260915. Docker recreated run and the engine started.

An isolated smoke passed, but docker desktop restart --timeout 60 reproduced the same failure at06:34:22UTC. This disproves a claim that the first rename alone fixed future restarts. The restart command ultimately failed; only task-started failed processes were closed, and the second pair of endpoints was preserved as run.RIR-006-restart-preserved-20260915. A first preservation attempt correctly refused while a Docker process still existed; it made no filesystem change.

Then launched the installed Docker Desktop executable through the Windows Explorer shell, rather than as a direct agent-command child. Engine startup succeeded. docker desktop stop --timeout 30 exited0; no Desktop/backend processes or entries in run remained. Relaunched through Explorer WITHOUT another rename or cleanup. Engine info and the second isolated smoke both passed. Docker is left running; existing containers remain stopped. This controlled difference supports a launch-context explanation, not a proven kernel/agent root cause. No Docker/Windows upgrade or persistent launch setting was installed.

## Repeatable launch and recovery guidance

For future agent-driven startup use the tested shell launch (or the user's normal Start menu):

~~~powershell
Start-Process -FilePath "$env:WINDIR\explorer.exe" -ArgumentList '"C:\Program Files\Docker\Docker\Docker Desktop.exe"' -WindowStyle Hidden
~~~

Inspect current context and running workloads before a stop. The tested clean cycle is docker desktop stop --timeout 30, verify Desktop/backend exit and endpoint cleanup, then shell launch. Avoid direct agent-child startup and docker desktop restart in this host context until separately verified; the latter reproduced failure. Do not restart existing workloads simply to test this again.

If the exact endpoint failure returns, inspect stopped state and directory contents first. Preserve only the confirmed transient run directory under a fresh same-parent name; never move Docker/wsl, settings or persistent data. A directory with unexpected contents is a stop condition. Both preserved directories remain intact; they are diagnostic backups, not a startup dependency. To reverse the directory operation for forensic purposes, stop Docker, preserve the newly created run under another unused sibling name, and rename the selected original directory back; restoring the failing endpoints is expected to restore the failure. Do not delete these objects or edit reparse metadata blindly. No automatic startup script or recurring action was installed.

## Verification evidence

- docker version/info: Engine28.4.0, Linux x86_64; final repeated info passed after clean stop and shell relaunch.
- Existing local redis:7 image resolved to sha256:604502f6c579cb24daf50d5befb7cea78fa4d974f85d6d358dcfcc6f2569cb30. No image was pulled. Entrypoint was /bin/sh, so no Redis service was launched.
- Two exact uniquely named disposable containers used --rm, --pull never, --network none, --read-only, UID/GID65534, --cap-drop ALL, no-new-privileges, and 1MiB /tmp and /data tmpfs mounts (overriding image volume). Assertions verified non-root UID and temporary filesystem write/read. First output RIR006_ENGINE_SMOKE_OK; final post-relaunch output RIR006_RESTART_SMOKE_OK; both exit0. Both containers removed automatically, no new persistent volume.
- Resource counts after first recovery and after all tests: nine images, seven existing containers, zero running containers, three local volumes. Inventory was unavailable before engine recovery; these counts are a post-recovery comparison, not an invented pre-failure inventory. No existing workload was started/removed.
- Docker settings-store.json SHA256 before and after: 3EC0F18FE6933980C922BACEE02ED9DEB798A91F35864882E835CE4DA9FF0C13. No settings change. Existing docker_data.vhdx and main/ext4.vhdx were not moved/reset/edited by repair commands; normal engine operation may update disk contents. No data-integrity scan is claimed.
- Requirements check passed91 sections/35 exact criteria. BP-69/AC-32 remain partial: repairing this host does not validate the Ririko image or live deployment. RIR-003 application build/storage/health/shutdown checks remain paused and unexecuted.
- Only .workboard evidence/state files changed in Git; no runtime code, dependencies or tests changed. Unit suites were not rerun for this host-only repair. Final board, diff and publication-scope checks accompany the local commit.

## Sources and limits

Docker's CLI documentation supports bounded stop: https://docs.docker.com/reference/cli/docker/desktop/stop/. Upstream Docker report https://github.com/docker/desktop-feedback/issues/460 describes similar inaccessible endpoints and parent-directory preservation on build26200. https://github.com/anthropics/claude-code/issues/76383 reports a process-tree-dependent AF_UNIX lifecycle problem in another agent environment. These reports motivated the launch-context experiment; neither proves this host's exact cause. Persistent kernel/software remediation remains unproven; the tested shell launch/clean stop cycle is the operational workaround.

## Delivery and resume

Acceptance met for restored engine plus safe isolated execution and preserved state. Move through review/done and put BATCH-006 at checkpoint. No push/PR/merge authorized. Prepare .workboard/reviews/BATCH-006.md and ask whether to publish this administrative repair record or defer it locally before resuming RIR-003. The latter remains paused; do not silently switch. All inspection/stop/smoke command sessions finished; Docker Desktop is intentionally left running. The workspace should be clean after the local checkpoint commit.

## Publication update

The pending-publication statement above is superseded by [the verified PR #572 receipt](003-published.md). RIR-003 remains paused.
