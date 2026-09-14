# Deployment and recovery runbook

## What this release can run

This runbook covers the implemented Discord bot, operator CLI and SQLite/PostgreSQL foundation. Working Discord commands are `ping`, `prefix`/`setprefix` and `help`. There is no web app, Redis service, Lavalink node, FFmpeg installation, provider adapter fleet, persistent job system or full 1.4.0 migration in this deployment. [Roadmap](implementation-roadmap.md), [requirements](requirements.md) and [testing](testing.md) distinguish implementation from planned acceptance.

The comparison baseline is the complete Gemini `docs/deployment.md` at `1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33`. Its multi-service example and rich `/health` JSON are proposals, not descriptions of these files. Actual sources are [Dockerfile](../Dockerfile), [compose.yaml](../compose.yaml), [CI](../.github/workflows/ci.yml), [runtime](../apps/bot/src/index.ts), [health](../apps/bot/src/health.ts), [CLI](../apps/cli/src/cli.ts) and the [database package](../packages/database/src/index.ts).

Commands below are operator instructions, not actions executed by this documentation task. Start with inspection/build validation; migrations write the selected database, startup connects to Discord, and command synchronization changes registrations. Perform those stages only for the intended environment and approved rollout. Never substitute a production database into a disposable test example.

| Component | Actual configuration and limitation |
|---|---|
| Runtime image | `node:24.19.0-bookworm-slim`, final target `runtime`; runs as `node`, not a custom UID 10001 user. Application code is compiled before copying. |
| Build/install | pnpm 10.34.5, frozen lockfile; Python, make and g++ installed in dependency stages for native SQLite builds. Separate production dependency installation preserves workspace links. |
| Final image | Compiled core/database/Discord packages and bot/CLI apps plus production dependencies. No pnpm binary, TypeScript, Vitest, compilers or FFmpeg are installed by the final stage. Invoke compiled CLI with `node`, not `pnpm`, inside it. |
| Compose | Project name `ririko`; services `postgres` and `bot` only. PostgreSQL `18.6-bookworm`; app image `ririko:2.0.0`. No host ports published. |
| Persistent state | PostgreSQL named volume mounted at `/var/lib/postgresql`; bot volume at `/app/data`. Bot root is read-only, `/tmp` is a 64 MiB tmpfs. |
| Local host | Observed development Node is 24.13.1; package engines accept `>=24.13.1 <25`. Selected image/CI Node is 24.19.0. A local pass does not prove native compatibility on the Linux target. |
| Version identity | Package version 2.0.0 identifies the foundation, not full-platform completion. Record source commit, lockfile hash, actual image ID/digest and migration version for each deployment. |

[Dependency evaluation](dependency-evaluation.md) explains dated selections. Image tags and apt repositories are not immutable content digests; record resolved artifacts and review updates before production. A frozen JavaScript lockfile alone is not a complete reproducible operating-system build. New audio/image/web requirements need their own implementation and target-platform checks; do not assume canvas or FFmpeg works because the older proposal included it.

## Preflight, secrets and environment boundaries

Use a long-running host for the Discord Gateway. For containers, use Docker Engine/Desktop with Linux containers and the Compose plugin. Verify available disk for build layers, database growth and two backup generations; measure CPU/memory/native-library behavior on the target architecture. Compose currently specifies no CPU/memory quotas, log rotation policy, resource autoscaling or multi-replica/sharding configuration. Do not claim a universal “lightweight VPS” capacity without a workload test.

Keep deployment credentials in a private `.env.deploy` outside source publication. Git and the Docker context ignore `.env.*`; that is not encryption or access control. Host/container administrators can inspect injected environment values. Avoid printing expanded `docker compose config`, `docker inspect` environment fields or full process configuration into tickets. Use `config --quiet` for validation. The application does not implement `*_FILE` secret loading; a future mounted secret facility needs an explicit adapter rather than an invented variable.

```dotenv
POSTGRES_PASSWORD=replace-with-random-database-admin-password
DATABASE_URL=postgres://ririko:URL_ENCODED_APPLICATION_PASSWORD@postgres:5432/ririko
DISCORD_TOKEN=replace-with-discord-bot-token
DISCORD_APPLICATION_ID=replace-with-discord-application-snowflake
BOT_OWNER_IDS=
DEFAULT_PREFIX=!
LOG_LEVEL=info
```

Database administrator and application passwords are distinct. Percent-encode reserved characters in the application URL; use the real application ID, not the obsolete `DISCORD_CLIENT_ID` variable. `BOT_OWNER_IDS` is a comma-separated list used by privileged local CLI writes. Configure it only for intended operator attribution. The current CLI trusts access to host/config/database; its first configured owner ID and supplied ManageGuild permission do not prove live Discord membership.

Compose injects `DATABASE_DIALECT=postgres`, `HEALTH_HOST=127.0.0.1`, `HEALTH_PORT=3001` and `NODE_ENV=production`. The default image without Compose uses SQLite `/app/data/ririko.db`. Confirm which launch mode you are using before migration. Plain `.env` is loaded by the bot/CLI when present in their working directory; Compose's interpolation file is not copied into the image. Keep deployment working directories and environment files separate from local development and tests.

Discord credentials are required for starting the bot and synchronizing commands. Prefix handling needs the Message Content intent and the implemented gateway intents; inspect [Discord development guidance](development.md) before enabling/installing the application. Offline schema/status work does not require a successful Discord login. Provider/OAuth/vault variables from future designs have no functioning consumer here.

For a remote PostgreSQL server, replace the Compose service hostname with the reviewed connection address and configure transport authentication/TLS according to that server and driver deployment. No TLS termination, public reverse proxy or firewall rule is installed by this repository. Do not expose database/health ports merely to make a local diagnostic convenient. Future web deployment additionally needs canonical HTTPS origin, session/OAuth configuration and authorization tests from [dashboard](dashboard.md).

## Build and first PostgreSQL installation

From the repository root, the following Docker commands work in PowerShell or a POSIX shell. They validate interpolation, build the runtime image and start only PostgreSQL; build and image pulls need registry/package network access. `config --quiet` does not require starting containers.

```sh
docker compose --env-file .env.deploy config --quiet
docker compose --env-file .env.deploy build bot
docker compose --env-file .env.deploy up -d --wait postgres
docker compose --env-file .env.deploy ps
```

PostgreSQL 18's official image uses a major-version directory below `/var/lib/postgresql`; this Compose mount matches it. Do not replace it with an older `/var/lib/postgresql/data` recipe. Initialization environment values apply to a new cluster; changing a password variable does not rotate an existing database role's password. [Official PostgreSQL image](https://hub.docker.com/_/postgres).

On a newly initialized database only, open the administrator session:

```sh
docker compose --env-file .env.deploy exec postgres psql -U postgres -d ririko
```

Inside psql, create the non-superuser application role and set its password interactively:

```sql
CREATE ROLE ririko LOGIN;
\password ririko
GRANT CONNECT ON DATABASE ririko TO ririko;
GRANT USAGE, CREATE ON SCHEMA public TO ririko;
\q
```

Use that password, URL-encoded, in `DATABASE_URL`. The role owns the tables it creates during migration; it is not cluster superuser. Do not repeat first-install role creation on an existing cluster or substitute the administrator URL into routine application configuration. The current deployment uses one application role for migration/runtime; a separate migration role and reduced runtime grants are future hardening that must be tested against all repository queries before adoption.

Compose waits for the declared database healthcheck when starting dependent services, but `pg_isready` is not proof that the application role can authenticate or the Ririko schema exists. Dependency readiness at startup is not ongoing recovery orchestration. [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/).

## Migration ownership, diagnosis and startup

Run exactly one reviewed migration owner for the selected database before bot startup:

```sh
docker compose --env-file .env.deploy run --rm --no-deps bot node apps/cli/dist/index.js migrate:status
docker compose --env-file .env.deploy run --rm --no-deps bot node apps/cli/dist/index.js migrate
docker compose --env-file .env.deploy run --rm --no-deps bot node apps/cli/dist/index.js migrate:status
docker compose --env-file .env.deploy run --rm --no-deps bot node apps/cli/dist/index.js doctor --json
```

Inspect every exit/result before continuing. Status should be `{"current":1,"latest":1}` after migration. `doctor` reports configured credentials without validating them with Discord; missing required credentials make it fail even if schema work succeeded. FFmpeg absence and unimplemented providers are optional diagnostics, not installed capabilities. A missing SQLite file can be inspected without creating it; `migrate` is the explicit creator.

Current migration version 1 creates only `ririko_schema_migrations`, `guild_settings` and `settings_audit`, with fixed dialect-specific SQL and a checksum. PostgreSQL uses a transaction advisory lock; SQLite uses an immediate transaction. DDL and history commit atomically on supported paths. Locks guard concurrent migrations but do not authorize them or make unknown SQL safe. The bot checks status and refuses pending schema; it never auto-runs migration at startup.

Unknown/legacy objects, incomplete managed object sets or unexpected history/checksums are refused. `migrationStatus` checks object names and the exact single version/checksum row; it does not fingerprint every live column/index/constraint or repair tampering. The checked-in migration SQL is installed-schema authority, not a guarantee that a manually altered database is healthy. Preserve evidence and follow [migrations](migrations.md), rather than deleting tables or editing checksums to get past an error.

This is not `migrate:legacy`: no legacy importer exists. Never point the foundation migrator at the immutable legacy database. [Legacy cutover](migration-1.x-to-2.0.md) defines the planned separate-target, write-freeze and reconciliation process; users' coins, karma and configurations cannot be discarded just because only three new tables exist.

After migration/diagnostics and the intended live rollout are approved:

```sh
docker compose --env-file .env.deploy up -d bot
docker compose --env-file .env.deploy ps
docker compose --env-file .env.deploy logs --tail 100 bot
```

Startup validates environment/credentials, checks schema/database, starts the private health listener, installs shutdown handlers and logs in to Discord. A successful process start is not yet readiness. Inspect sanitized errors and the readiness check before considering the bot admitted. Starting a second bot with the same credentials is not an implemented high-availability strategy.

### Slash registration is a separate external mutation

Inspect current metadata first:

```sh
docker compose --env-file .env.deploy run --rm --no-deps bot node apps/cli/dist/index.js command:list --json
```

Only when deliberately updating the named development guild:

```sh
docker compose --env-file .env.deploy run --rm --no-deps -e DISCORD_GUILD_ID=REPLACE_WITH_GUILD_SNOWFLAKE bot node apps/cli/dist/index.js command:sync
```

Replace the placeholder before execution. Synchronization bulk-replaces the selected application/guild command collection with the current registry; it can remove registrations absent from that registry. `--global` explicitly targets global registration and needs separate scope review. Startup does not synchronize, and an image rollback does not restore older registrations automatically. Never use fake CI credentials to test a live sync.

## Health, status and shutdown

The listener defaults to `127.0.0.1:3001` inside the container, with no published host port. Use a bounded probe from the bot container:

```sh
docker compose --env-file .env.deploy exec bot node -e "fetch('http://127.0.0.1:3001/health/ready', { signal: AbortSignal.timeout(4000) }).then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))"
```

| Surface | Actual meaning |
|---|---|
| `GET /health/live` | 200 `{"status":"alive"}` while the listener can respond; independent of database/Discord. It does not prove event-loop latency or correct commands. |
| `GET /health/ready` | 200 only when database probe succeeds, gateway is ready and shutdown is false; otherwise 503 with database/discord booleans. No provider, queue, shard-count or latency catalog exists. |
| Other URL / method | Unknown paths return 404; non-GET returns 405. Responses use JSON and `Cache-Control: no-store`. `/health` and `/ready` are not the actual routes. |
| CLI `health` | Database/schema check only. It explicitly points operators to the running bot for Discord readiness. |
| Image healthcheck | Readiness every 30 seconds, 30-second start period, three retries; fetch abort at four seconds and Docker command timeout at five seconds. |

The database probe races a two-second timer but does not cancel the underlying query. Only one probe can remain outstanding; another simultaneous readiness request returns not-ready. A permanently unresolved driver call can therefore keep readiness failing. Synchronous SQLite work can delay the event loop and timer itself, so the timer is not a guaranteed two-second wall-clock ceiling. Avoid excessive concurrent probes and investigate driver/host state before resetting the process.

PostgreSQL pool limits are five connections per process, connect timeout 10 seconds, idle timeout 20 seconds, statement/lock timeouts five seconds and close timeout five seconds. Multiply pool demand by bot, CLI and any future web/worker processes. SQLite uses a five-second busy timeout and foreign keys; it does not explicitly enable WAL. Do not describe either timeout as cancelling every possible network/OS stall or guaranteeing a bounded whole shutdown.

Stop only the bot for a controlled maintenance window:

```sh
docker compose --env-file .env.deploy stop bot
docker compose --env-file .env.deploy ps
```

SIGTERM/SIGINT marks shutdown, destroys the gateway and drains its tracked pending dispatch work while closing the health server/connections; database close follows. Shutdown is guarded against duplicate initiation, but there is no application-wide drain deadline. Compose uses an init process and a 30-second stop grace period; the container may be forcibly killed when that expires. Verify exit/log evidence and outstanding work before declaring a graceful stop. Future jobs, voice sessions, outbox/receipts and wagers need explicit drain/recovery contracts before deployment.

`restart: unless-stopped` concerns process/container exits and host restart behavior; an unhealthy label alone does not restart a still-running container. Do not combine a blind restart loop with an unresolved database/schema incident. [Docker restart policies](https://docs.docker.com/engine/containers/start-containers-automatically/).

Changing HEALTH_HOST to a public bind expands exposure and does not add authentication. The image check still targets loopback; adapt exposure and probes deliberately. Liveness/readiness have no secret payload by design, but public traffic can still consume connections/probe work. Keep them private unless a reviewed ingress policy requires otherwise.

## Local Windows/Linux and standalone SQLite

For local source use, follow [development](development.md) for dependency/native setup. From the repository root, these commands are identical in PowerShell and POSIX shells:

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm build
pnpm ririko migrate:status
```

The install/build may need network and native build tools. Review `.env` before selecting a database. To initialize the intended local database, explicitly run `pnpm ririko migrate`; inspect `pnpm ririko migrate:status` and `pnpm ririko doctor --json`. For live startup after credential/intent setup, `pnpm start` runs compiled output and `pnpm dev` runs source. `pnpm ririko start`/`dev` are not implemented CLI verbs. Ctrl+C requests application shutdown in the foreground; no systemd unit, Windows service installer or cloud platform deployment is supplied. A production host service needs an explicit working directory, account/environment and stop policy; avoid `kill -9`/forced process termination as routine shutdown.

For one standalone SQLite bot container, create private `.env.sqlite`:

```dotenv
DATABASE_DIALECT=sqlite
DATABASE_URL=/app/data/ririko.db
DISCORD_TOKEN=replace-with-discord-bot-token
DISCORD_APPLICATION_ID=replace-with-discord-application-snowflake
BOT_OWNER_IDS=
DEFAULT_PREFIX=!
LOG_LEVEL=info
```

Use the same named volume for schema, diagnostics and runtime:

```sh
docker build --target runtime -t ririko:2.0.0 .
docker volume create ririko-sqlite
docker run --rm --network none --env-file .env.sqlite -v ririko-sqlite:/app/data ririko:2.0.0 node apps/cli/dist/index.js migrate
docker run --rm --network none --env-file .env.sqlite -v ririko-sqlite:/app/data ririko:2.0.0 node apps/cli/dist/index.js doctor --json
```

These two CLI containers need no Discord network access; doctor still requires credential fields to report configured status. Only the following deliberate runtime start connects to Discord:

```sh
docker run -d --name ririko-sqlite --init --restart unless-stopped --stop-timeout 30 --read-only --tmpfs /tmp:size=64m,mode=1777 --env-file .env.sqlite -v ririko-sqlite:/app/data ririko:2.0.0
docker logs --tail 100 ririko-sqlite
docker stop --time 30 ririko-sqlite
```

Check that names/volumes belong to this deployment before reusing them. Named-volume initialization inherits `/app/data` ownership from the image. Host bind mounts require permissions for the image's `node` identity (normally UID/GID 1000 on this selected image); verify it on the built artifact rather than running the bot as root to mask ownership errors. Do not run concurrent bot replicas against the SQLite volume. Short CLI operations still contend with the bot, and synchronous SQLite can affect responsiveness. No multi-host network-filesystem SQLite support is claimed.

## Backups and isolated restore rehearsal

Define an operator-owned backup schedule, retention, encryption/access, off-host destination, alerting, recovery-point objective and recovery-time objective. None is automated by this repository. Record UTC snapshot time, source database/volume, source commit/image ID, schema version, byte size and cryptographic checksum without embedding passwords. A checksum verifies file integrity, not restored application correctness. Keep backup encryption keys recoverable separately from archives; future secret-vault key IDs must remain available for encrypted rows.

Create a **new, uniquely named** backup directory for each run. POSIX example: `mkdir -p data/backups/2026-09-14T120000Z`. PowerShell example: `New-Item -ItemType Directory -Path data/backups/2026-09-14T120000Z`. Replace the timestamp below with the actual run and do not overwrite an existing archive. `data/` is ignored by Git and the Docker context; protect it from unrelated host users.

### PostgreSQL snapshot and restore

Produce a custom-format archive inside the database container, then copy it as a file to avoid shell-dependent binary redirection:

```sh
docker compose --env-file .env.deploy exec postgres pg_dump -U postgres -d ririko -Fc -f /tmp/ririko-20260914T120000Z.dump
docker compose --env-file .env.deploy cp postgres:/tmp/ririko-20260914T120000Z.dump ./data/backups/2026-09-14T120000Z/ririko.dump
```

`pg_dump` produces a consistent database snapshot while ordinary writers can continue, but excludes cluster-level roles/passwords and does not snapshot external assets/effects. Preserve the nonsecret role/grant setup and separate credential recovery. Use matching supported client/server tooling. [PostgreSQL pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html).

A concrete rehearsal uses a **new** Compose project and separate `.env.restore` whose DATABASE_URL targets `/ririko_restore`. Verify `docker compose ls` and existing project/volume inventory first; the example project name must not already be an unrelated environment. Use fresh restore credentials and dummy Discord configuration fields; do not start its bot gateway.

```sh
docker compose --project-name ririko-restore-check --env-file .env.restore up -d --wait postgres
docker compose --project-name ririko-restore-check --env-file .env.restore exec postgres psql -U postgres -d postgres
```

Inside this isolated cluster only:

```sql
CREATE ROLE ririko LOGIN;
\password ririko
CREATE DATABASE ririko_restore OWNER ririko;
\q
```

Copy and restore into that empty target, preserving the production database:

```sh
docker compose --project-name ririko-restore-check --env-file .env.restore cp ./data/backups/2026-09-14T120000Z/ririko.dump postgres:/tmp/ririko.dump
docker compose --project-name ririko-restore-check --env-file .env.restore exec postgres pg_restore --exit-on-error --no-owner --no-privileges --role=ririko -U postgres -d ririko_restore /tmp/ririko.dump
docker compose --project-name ririko-restore-check --env-file .env.restore run --rm --no-deps bot node apps/cli/dist/index.js migrate:status
docker compose --project-name ririko-restore-check --env-file .env.restore run --rm --no-deps bot node apps/cli/dist/index.js doctor --json
```

The application role must own/have appropriate rights in the restored target; `--no-owner --no-privileges` avoids replaying source ownership/ACLs and requires deliberate grant setup. Restore only trusted archives, check the command exit and inspect every error; do not retry into a partially restored target as though it were empty. Rehearsal should recreate a fresh isolated target after diagnosing failures, not alter production. [PostgreSQL pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).

Verify expected table/row counts, sampled settings, revisions and matching audit transitions, not just migration version. Future domain restores additionally reconcile ledger totals, holds, inventory, jobs and receipt uniqueness. Record elapsed restore/verification time and actual loss window. Stop the isolated project's PostgreSQL after review; retain its evidence/volumes until deliberate cleanup is authorized. This documentation task has not performed this rehearsal.

### SQLite snapshot and restore

Stop every writer, including CLI/helper processes, and confirm the runtime stopped before copying the entire data directory. For the standalone example, after creating a new backup directory:

```sh
docker stop --time 30 ririko-sqlite
docker container inspect --format '{{.State.Running}}' ririko-sqlite
docker cp ririko-sqlite:/app/data/. ./data/backups/2026-09-14T120000Z/
```

Proceed with the copy only when inspection reports false and no other process mounts/writes that volume. Preserve all files including journal/WAL/SHM companions if present. The current adapter does not enable WAL, but a copied/restored deployment may contain journal-related state; copying only an actively written `.db` file is not a backup procedure. An online backup requires a supported SQLite backup API workflow, not a live filesystem copy. [SQLite backup documentation](https://sqlite.org/backup.html).

Restart the original container with `docker start ririko-sqlite` only after copy completion and the intended end of maintenance. Restore into a fresh separate directory/volume, preserve ownership/read-write access for the runtime user and use the same compatible image for offline `migrate:status`/`doctor`. The copying mechanism depends on host/volume storage; inspect resolved source/destination and never overwrite the running volume. Verify SQLite integrity, row/audit correspondence and expected settings using a reviewed database inspection tool before cutover. No `ririko db:backup` or `db:restore` command is implemented.

### External effects and restore consistency

A SQL snapshot cannot undo Discord messages, role changes, previously delivered prizes or provider charges. Today only foundation settings/audit are present; future outbox/job/receipt/ledger state must be backed up consistently with domain rows and external evidence. After restoring an old snapshot, receipts for later completed effects may be missing. Keep new admission disabled, classify post-snapshot effects as known completed/known absent/unknown, then reconcile or compensate before replay. Do not automatically resend announcements, reroll games or reissue funds because restored rows say pending. Asset/object storage manifests and credential-key references require a coordinated snapshot policy when those services exist.

## Upgrade, rollback and publication boundaries

Before replacing an image, record the currently running image ID/digest, source commit, environment identity, schema version, backup receipt and observed health. The shared tag `ririko:2.0.0` can move when rebuilt; preserve the previous artifact under a unique release tag/digest before building a replacement. Do not rely on the tag name alone to roll back. Review native dependencies, Node/security releases and migration compatibility against [dependency evaluation](dependency-evaluation.md).

Upgrade sequence:

1. Build and verify the candidate artifact without changing the running bot; retain the old artifact. Rehearse any migration against an isolated restored database and record results.
2. Announce/record the write-freeze window and stop the bot plus other writers. Future web/workers need explicit admission/drain controls before deployment; none exists today as a CLI maintenance command.
3. Take the verified cutover backup or confirm the selected recovery point. Run one explicit migration from the candidate image, then inspect schema and application data.
4. Start the candidate bot once; check readiness, logs, required command behavior and persisted settings. Perform any registration change as a separately reviewed external mutation.
5. Close the maintenance window only when the checks pass; retain the old artifact and restore evidence for the declared rollback window.

For image selection, use a reviewed Compose override containing only the intended bot image reference, then inspect its merged configuration quietly. Do not silently rebuild the old tag or guess a previous commit. Configuration changes to the container environment need recreation; a simple `docker compose restart` does not apply new container configuration. [Compose restart reference](https://docs.docker.com/reference/cli/docker/compose/restart/). Review the exact up/recreate plan before execution. Never force a new database major version against an old data volume; use PostgreSQL's supported upgrade/dump-restore procedure and a separate tested target.

| Situation | Recovery decision |
|---|---|
| New app fails; schema/data remain compatible | Stop candidate, select preserved previous artifact/configuration and start it against the compatible database; verify before reopening writes. |
| New schema is incompatible with old app | Do not start old code blindly. Restore into a separate compatible target or use a reviewed forward repair; there is no generic down-migration command. |
| Writes occurred after backup | Quantify the lost/reconciled interval. Restoring that backup is not lossless rollback; preserve the failed target for investigation and external-effect reconciliation. |
| New settings caused failure | Restore reviewed nonsecret configuration through supported service/operator recovery, retaining audit. Do not delete the database or rewrite migration history. |
| Registration changed | Review desired guild/global metadata and explicitly synchronize the correct application target; changing the image alone does not revert Discord registrations. |
| Secret compromised | Follow the authorized provider/key rotation and incident procedure; source rollback cannot make an exposed credential safe. Do not post secret values in an incident report. |

`docker compose down` normally retains named volumes; adding volume-removal options destroys persistent state. [Compose down reference](https://docs.docker.com/reference/cli/docker/compose/down/). Routine maintenance uses `stop`, not volume deletion. Preserve unknown containers, volumes and user changes. Never run broad prune, force/reset/clean or recursive deletion as a recovery shortcut.

Code delivery still follows the [standing work protocol](../.workboard/PROTOCOL.md): one estimated active ticket and one epic/story delivery scope. The verified integration branch is `develop/2.0.0-astra`, not Gemini's `develop/2.0.0`. The documentation epic is stacked above the exact approved PR #557 parent; use `pnpm board pr-plan`/`guard-pr` to resolve its current immediate target rather than copying an example branch. At the epic checkpoint prepare the concrete diff/evidence and ask whether to create the PR. A deployment runbook is not push, image-publication, PR or merge approval; no force push or automatic merge is authorized.

## Incident triage and observability

Collect sanitized timestamp, deployment/image identity, command exit, readiness result and a bounded log excerpt before changing state. Do not include environment dumps, private message bodies, raw prompts, tokens or database URLs. The Pino logger redacts named paths; it is not a universal scanner of arbitrary nested strings or exception messages. Callers still must avoid logging sensitive payloads.

| Symptom | First diagnosis and safe response |
|---|---|
| Compose validation fails | Check required variable names/file selection locally without printing values. Resolve syntax/configuration before any start; do not substitute production credentials into CI fixtures. |
| Native module load/build failure | Verify architecture, Node ABI, locked install and build tools on the target. Rebuild the artifact; do not copy Windows `node_modules` into Linux or enable every install script blindly. |
| `FOREIGN_SCHEMA` / `SCHEMA_INVALID` | Confirm target database and expected release/history. Preserve backup and inspect drift; never delete unexpected tables or forge a checksum. |
| PostgreSQL healthy, bot DB failure | Check application-role login/grants, correct database/schema and migration status. `pg_isready` checks server readiness, not application correctness. |
| SQLite busy/permission failure | Identify all writers, volume ownership and disk space. Stop unintended concurrency; do not start root-owned replicas or remove journal files. |
| Liveness good, readiness 503 | Inspect database versus Discord booleans, shutdown state and outstanding-probe behavior. Investigate gateway/configuration or DB timeout without assuming the process crashed. |
| Health listener unreachable | Check process exit/startup error, inside-container address/port and event-loop stall. No host port is published by default; public exposure is not the first fix. |
| Repeated restart / exit 137 | Inspect container exit/OOM/host resource evidence and stop timing. A forced termination does not prove application cleanup completed. Preserve state before restart loops. |
| Slash commands missing/removed | Compare registry and target application/guild/global collection. Review any recent bulk sync; avoid repeatedly syncing all scopes. |
| Prefix stopped working | Inspect Message Content intent, current prefix/module/command/channel/role policies and actor permissions. CLI edits only prefix/module state; do not invent a full command-policy recovery command. |
| Storage growth / disk full | Inspect database, image layers, logs and backups with retention ownership. Preserve durable state; cleaning all Docker volumes is not an acceptable space-recovery plan. |
| Future job/provider delayed | Distinguish quota, unsupported capability, pending and unknown outcome. Reconcile receipts and budget before retry/fallback; these runtime subsystems do not exist yet. |

Current observability consists of structured logging and basic database/gateway probes. There is no Prometheus endpoint, provider-health dashboard, persistent queue metric, distributed trace backend or measured production SLO. Proposed release metrics include gateway reconnect/error counts, dispatch latency, pool usage, DB conflict/timeouts, event-loop lag, memory/CPU/disk, oldest job/receipt age, provider quota and reconciliation failures. Keep high-cardinality user/guild IDs in access-controlled logs rather than unlimited metric labels; choose retention and alert thresholds from measured load.

Do not let optional future provider failure make process liveness fail. Readiness semantics for optional/required modules need explicit capability policy; a single “all providers healthy” gate can cause needless downtime. Scaling requires gateway/shard ownership, per-process pool sizing, distributed job leases and idempotent effects, not just a Compose replica count. Redis/object storage/Lavalink are optional future decisions, not required services hidden from this runbook.

## CI, verification evidence and production gates

The current [workflow](../.github/workflows/ci.yml) declares Ubuntu 24.04, Node 24.19.0, pnpm 10.34.5 and isolated PostgreSQL 18.6 fixtures. It validates board/requirements and PR scope, installs locked dependencies/native tools, runs lint/typecheck/unit/integration/E2E/build, validates Compose, builds the runtime image and performs offline SQLite migration/doctor checks in a read-only-root container. Action dependencies are pinned to commit hashes. Test passwords/tokens are disposable fixtures; no live Discord or provider test follows from them.

The image check explicitly tests non-root execution and absence of resolvable TypeScript, then migration/diagnostics. It does not prove long-running gateway readiness, external API compatibility, persistent volume restart, backup restore or complete production-dependency vulnerability coverage. CI declaration is not evidence of a successful remote run. The current E2E scope is described in [testing](testing.md); there are no dashboard login tests because no dashboard exists.

Production admission requires recorded evidence for the selected artifact/environment:

- Required lint/type/build and appropriate test results, with skipped/conditional suites identified.
- Linux/native production image build, non-root/read-only-root execution, correct workspace dependencies and writable volume permissions.
- Schema/role setup and explicit migration against a rehearsal target; checksum/name checks supplemented by data verification.
- Authorized live Discord startup, gateway readiness, slash/prefix behavior and registration-scope review.
- Stop/restart behavior within measured limits, database outage recovery and durable volume persistence.
- Isolated backup restore, actual RPO/RTO, secret/key recovery and post-snapshot external-effect handling.
- Resource/load measurements, log rotation/retention, host/network controls and an executable rollback decision with preserved artifact.

Earlier documentation recorded an unavailable local Docker daemon. This ticket has not started Docker, built/run containers, performed migrations, contacted Discord/providers or rehearsed restoration; it does not reassert that earlier host condition as a fresh measurement. Consult [testing](testing.md) for exact current checks and limitations. These deployment gates remain open until their evidence is produced under an authorized implementation/rollout scope.
