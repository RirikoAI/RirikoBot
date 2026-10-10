# Production Deployment & Infrastructure Runbook (Ririko AI 2.0.0)

## 1. Overview & Sane Infrastructure Defaults
In strict accordance with Section 68 and 69 of `BLUEPRINT.md`: **Do not over-engineer deployment.**
- Ririko AI 2.0.0 avoids excessive cloud microservices, Kubernetes clusters, and message bus sprawl.
- The standard production deployment consists of two containerized applications (`bot` and `web`), a PostgreSQL database, and a Lavalink audio node. There is no Redis: nothing in 2.0 needs one.
- Self-hosters can run the entire platform on a single lightweight VPS using SQLite and local audio extraction without Docker dependencies if desired.

---

## 2. Docker Architecture

### 2.1. Multi-Stage Containerization (`Dockerfile`)
The root `Dockerfile` builds both images, `bot-runner` and `web-runner`, from one set of shared stages. `.dockerignore` keeps `node_modules`, build output, `.env` files, runtime data (`data/`, `storage/`, `public/cards`, `public/bosses`), the local Lavalink install and the private music package out of the build context.

| Stage | Purpose |
|---|---|
| `base` | `node:22-bookworm-slim` with pnpm enabled through corepack (version from `packageManager`). |
| `manifests` | Workspace `package.json` files, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `.npmrc`. A new workspace package must be added to its `COPY` list. |
| `build` | Full frozen install, then `pnpm build` (`tsc -b`). |
| `web-build` | `build` plus the Next.js production build of the dashboard (`.next/cache` removed). |
| `bot-deps`, `web-deps` | Production dependencies of `@ririko/cli` (which depends on `@ririko/bot`) or `@ririko/web` and the workspace packages each uses (`--prod --ignore-scripts`). |
| `runtime` | `node:22-bookworm-slim` with `tini`, `fonts-dejavu-core` and `ca-certificates`, and the `ririko` user (uid/gid 10001). No pnpm, no compilers. |
| `bot-runner` | `runtime` plus FFmpeg, the bot's and the CLI's `node_modules`, `dist` folders (including `apps/cli/dist`) and `assets/`. A root-owned `/usr/local/bin/ririko` wrapper runs the CLI. Runs `node apps/bot/dist/main.js`. |
| `web-runner` | `runtime` plus the dashboard's `node_modules`, `.next`, `next.config.ts` (and the file it imports) and `assets/tcg`. Runs `next start` on port 3000 from `/app/apps/web`. |

- **BuildKit**: the dependency installs use a BuildKit cache mount for the pnpm store, so builds need BuildKit (the default builder since Docker Engine 23, through the buildx plugin).
- **No compilers**: `better-sqlite3` and `@napi-rs/canvas` ship prebuilt binaries, so the images need neither build tools nor `libcairo2-dev`/`libpango1.0-dev`.
- **Monorepo layout**: the images keep the repository layout at `/app` (with `pnpm-workspace.yaml`), so `assets/`, `data/`, `public/cards`, `public/bosses` and `storage/` resolve as they do in development.
- **Operator commands**: the bot image carries the `ririko` CLI, so an operator runs commands inside the running container with its own `DATABASE_DIALECT` and `DATABASE_URL`, for example `docker exec <bot container> ririko passkeys:reset <user_id>` (add `--yes` to apply it; without it only the counts are reported). `docker exec <bot container> ririko --help` lists every command. The smoke check in `scripts/docker-smoke.ts` runs `ririko --help` in the built image. The web image has no CLI.
- **Dashboard build**: Next.js bundles the workspace packages into `.next/server`, so `web-runner` needs no package `dist` folders. The native packages it leaves external (`better-sqlite3`, `pg`, `@napi-rs/canvas`) are linked from `.next/node_modules` into the production `node_modules`.
- **Rootless**: the containers run as `USER 10001:10001`. Application files are owned by root and read-only to that user; only these directories are writable:

  | Path | Image | Contents |
  |---|---|---|
  | `/app/data` | both | SQLite database (default `DATABASE_URL=./data/ririko.sqlite`) and the card art cache. |
  | `/app/public/cards` | both | Rendered card images; the bot and the dashboard album write and read the same files. |
  | `/app/public/bosses` | bot | Rendered dungeon boss images. |
  | `/app/storage/welcomer-backgrounds` | both | Welcome and farewell backgrounds the dashboard uploads and the bot draws. |
  | `/app/apps/web/.next/cache` | web | Next.js image optimizer cache (Discord avatars). |

  The images create these directories owned by 10001, so a named volume mounted on one starts with that owner. A bind mount keeps the host's ownership: `chown -R 10001:10001` the host directory first. Mount `data`, `public/cards` and `storage/welcomer-backgrounds` as the same volumes in both containers.
- **Process**: `tini` is PID 1. It forwards `SIGTERM` to Node, which shuts the gateway down cleanly, and reaps FFmpeg child processes.
- **FFmpeg**: Included in the bot image for the built-in player used when Lavalink is not configured.
- **Environment**: The images read configuration only from environment variables (`.env` is never copied in). Both default to SQLite (`DATABASE_DIALECT=sqlite`, `DATABASE_URL=./data/ririko.sqlite`). The dashboard also needs `DISCORD_CLIENT_SECRET`, `DASHBOARD_URL` and `SECRET_VAULT_KEY`.
- **Upgrading from 1.4.0**: mount the old `./data` folder read-only at `/app/legacy` (`./data:/app/legacy:ro`). The bot image sets `LEGACY_DATABASE_PATH=/app/legacy/ririko.db` and migrates that database once on first start, without writing to it. The user guide is [docs/upgrading-from-1.4.md](upgrading-from-1.4.md); [docs/migrations.md section 4](migrations.md) explains how it works.

Build and run both on one host (SQLite):
```bash
docker build --target bot-runner -t ririko-bot .
docker build --target web-runner -t ririko-web .
docker run -d --name ririko-bot --env-file .env \
  --cap-drop ALL --security-opt no-new-privileges \
  -v ririko_data:/app/data -v ririko_cards:/app/public/cards \
  -v ririko_bosses:/app/public/bosses -v ririko_backgrounds:/app/storage/welcomer-backgrounds \
  ririko-bot
docker run -d --name ririko-web --env-file .env -p 3000:3000 \
  --cap-drop ALL --security-opt no-new-privileges \
  -v ririko_data:/app/data -v ririko_cards:/app/public/cards \
  -v ririko_backgrounds:/app/storage/welcomer-backgrounds \
  ririko-web
```

`node scripts/docker-smoke.ts bot web` checks built `ririko-bot:smoke` and `ririko-web:smoke` images with dummy credentials, no network and no capabilities:
- both run as uid 10001, and only the directories above are writable;
- the bot runs FFmpeg, starts up to command registration and creates its SQLite database, and migrates a root-owned 1.4.0 database at `/app/legacy` on first start without changing it;
- the dashboard loads its native packages;
- on an empty database it stays live (`/health`, `/api/health` and the `HEALTHCHECK` answer 200 with `MIGRATION_PENDING`) but not ready (`/ready` answers 503 and the log names the pending migration);
- on a database that a throwaway `ririko-bot:smoke` container migrated with `ririko db:migrate` first (so the bot image must be built too), it answers `GET /` with 200, redirects `/api/auth/login` to Discord, and `/health`, `/ready` and the `HEALTHCHECK` pass.

### 2.2. Production Orchestration (`docker-compose.production.yml`)

`docker-compose.production.yml` runs the whole stack on one host:

| Service | Image | Role |
|---|---|---|
| `postgres` | `postgres:16-alpine` | The database. Healthy when `pg_isready` answers. |
| `lavalink` | `ghcr.io/lavalink-devs/lavalink:4.2.2` | Audio node. Uses `docker/lavalink/application.yml`, the same config `pnpm lavalink:install` writes, with the secrets read from its environment. |
| `bot` | `ririkoai/ririkobot:${RIRIKO_VERSION:-2}` | The Discord bot. Starts once Postgres is healthy. |
| `web` | `ririkoai/ririkobot-dashboard:${RIRIKO_VERSION:-2}` | The dashboard, published on `${DASHBOARD_BIND:-127.0.0.1}:${DASHBOARD_PORT:-3000}`. |

Start it:
1. Copy `.env.production.example` to `.env.production`.
2. Fill in the required values: the Discord credentials, `DASHBOARD_URL`, `SECRET_VAULT_KEY` (`openssl rand -hex 32`), `POSTGRES_PASSWORD` and `LAVALINK_PASSWORD`.
3. Run `docker compose -f docker-compose.production.yml --env-file .env.production up -d`.

What happens on startup:
- Every service reads `.env.production`, or the file named by `RIRIKO_ENV_FILE`.
- The compose file sets the values that must point inside the stack itself: `DATABASE_DIALECT=postgres`, `DATABASE_URL` (built from the `POSTGRES_*` values), `LAVALINK_HOST=lavalink` and `LAVALINK_PORT=2333`.
- On start the bot applies the schema migrations (`DB_AUTO_MIGRATE`, default `true`, see `docs/database.md` section 1): an empty database gets the baseline, a database from before migration records is adopted once. The dashboard never changes the schema: it answers `/ready` with 503, and logs the pending migrations, until the bot (or `ririko db:migrate`) has migrated the database, then recovers by itself. `/health` (the liveness probe and the `HEALTHCHECK`) stays 200 meanwhile.
- A hand-run stack keeps migrate-on-start: `docker compose pull && docker compose up -d` upgrades it with no other step. The CI host deploy (`ririko-deploy`, `docs/release.md` section 8) is different: it runs every compose call with `DB_AUTO_MIGRATE=false` in its environment (which wins over the env file), so the bot only checks the schema there, and the deploy runs `ririko db:migrate` from the new bot image after the pull and before `up -d` as its own step. It exits 6 without starting anything when that migration fails.
- `DB_AUTO_MIGRATE=false` makes the bot only check: it exits with a message naming the pending migrations instead of starting on an old schema. Then run `docker compose -f docker-compose.production.yml --env-file .env.production run --rm bot ririko db:migrate` (or `docker exec <bot container> ririko db:migrate` on a running bot), and start the bot again. `ririko db:migrate --status` prints the pending migrations, `--dry-run` the plan; exit code 2 means the downgrade guard refused (the database holds a contract migration this release does not know).
- Both images have a `HEALTHCHECK` (section 3).
- Compose refuses to start when `POSTGRES_PASSWORD` or `LAVALINK_PASSWORD` is empty.

Hardening (a test in `scripts/compose-production.test.ts` parses the file and keeps these settings from regressing):
- **Dashboard port:** published on loopback only (`DASHBOARD_BIND=127.0.0.1`), so it is reachable from the host itself and from nothing else. Put a reverse proxy or a tunnel on the host in front of it. To reach it on the LAN or from the internet, set `DASHBOARD_BIND=0.0.0.0`, and only on a host whose own firewall or reverse proxy protects the port. `DASHBOARD_PORT` still sets the host port.
- **Client IP header:** `CLIENT_IP_HEADER` (optional) names the one request header the dashboard trusts for the client address. It keys the sign-in, probe and pre-sign-in action rate limits and fills the session and audit records. Unset, the dashboard uses the first `X-Forwarded-For` entry, which Cloudflare does not overwrite (it appends the real address to whatever the client sent), so that entry is attacker-controlled behind Cloudflare and a client can pick its own rate-limit bucket. Set `CLIENT_IP_HEADER=cf-connecting-ip` there: Cloudflare sets that header itself. The value must be a valid IPv4 or IPv6 address, otherwise the client IP is empty (shared `unknown` bucket); there is no fallback to `X-Forwarded-For` or `X-Real-IP`. Set it only when every request reaches the dashboard through Cloudflare (a tunnel with the loopback binding above): on any other path a client sends the header itself. Requests without it, such as the container `HEALTHCHECK` and the deploy readiness poll, share one `unknown` bucket, which the probe limit (30 burst, 1 per second) covers. A malformed name stops the dashboard at startup.
- **Capabilities:** `bot` and `web` run with `cap_drop: [ALL]`: both images run as uid 10001 and use no Linux capability. `postgres` and `lavalink` keep theirs, because the Postgres entrypoint chowns its data directory and switches user.
- **Privileges:** all four services set `security_opt: [no-new-privileges:true]`, so no process in them can gain privileges through a setuid binary.
- **Log rotation:** all four services share one `x-logging` anchor: the `local` driver, `max-size: 20m`, `max-file: 5`. A service keeps at most 100 MB of logs.
- **Lavalink heap:** `LAVALINK_HEAP` sets the JVM maximum heap (`-Xmx`, default `1G`). Use `512m` on a small host.
- **Lavalink plugin volume:** the Lavalink image runs as uid/gid 322 and has no `/opt/Lavalink/plugins` directory, so Docker creates the named volume owned by root and Lavalink dies with `Permission denied` while it downloads its plugins. The one-shot `lavalink-plugins` service therefore runs `chown -R 322:322` on the volume before `lavalink` starts (`depends_on` with `service_completed_successfully`). It uses the same pinned Lavalink image, so nothing extra is pulled, runs as root with `cap_drop: [ALL]`, `cap_add: [CHOWN]`, `no-new-privileges` and no network, and shows as `Exited (0)` in `docker compose ps -a`. That is expected.

Remote Lavalink (`docker-compose.remote-lavalink.yml`): a single-host stack keeps the bundled `lavalink` service and needs nothing else. An app host that uses a Lavalink node on another machine, such as the Lightsail hosts with the Lavalink VPS (STORY-180), adds this override:
- Run `docker compose -f docker-compose.production.yml -f docker-compose.remote-lavalink.yml --env-file .env.production up -d`. It needs Docker Compose 2.24.4 or newer, because it uses `!override`.
- It puts the bundled `lavalink` service in the `bundled-lavalink` profile, which nobody enables, so it never starts, and does the same for its one-shot `lavalink-plugins` init service. `bot` then waits for Postgres only.
- The bot connects to `LAVALINK_HOST` (required: compose refuses to start without it) on `LAVALINK_PORT` (default `2333`). `LAVALINK_PASSWORD` must be the node's password.
- The bot reaches the node over a plain WebSocket (the `secure` option is not read from the environment), so the link itself must be private, for example WireGuard. If the node is unreachable, the bot falls back to its built-in FFmpeg player.

Dedicated Lavalink host (`deploy/lavalink/docker-compose.yml`, project `ririko-lavalink`): the VPS runs one Lavalink container per environment, `lavalink-production` (port 2333, heap `LAVALINK_PRODUCTION_HEAP`, default `1536m`) and `lavalink-staging` (port 2334, heap `LAVALINK_STAGING_HEAP`, default `512m`). Both use the image tag pinned in `docker-compose.production.yml`, and a test keeps the two files on the same tag.
- Run it from a checkout of the repository, because it mounts `../../docker/lavalink/application.yml` read-only: `WG_ADDRESS=10.77.0.1 docker compose up -d` in `deploy/lavalink/`.
- Each container binds only `WG_ADDRESS` (required), through `SERVER_ADDRESS` and `SERVER_PORT`, which override `server.address` and `server.port` in the config.
- `network_mode: host` lets the host firewall see each WireGuard peer; published ports would go through Docker's own chains and skip those rules.
- Each instance reads its own env file, `LAVALINK_PRODUCTION_ENV_FILE` and `LAVALINK_STAGING_ENV_FILE` (defaults `/opt/ririko/lavalink-production.env` and `/opt/ririko/lavalink-staging.env`), written from `deploy/lavalink/lavalink.env.example`: `LAVALINK_PASSWORD` (different for each instance) and the `SPOTIFY_*` values. A relative path resolves from `deploy/lavalink/`.
- Plugins live in separate volumes, `lavalink_production_plugins` and `lavalink_staging_plugins`. Each is chowned to uid/gid 322 (the user the image runs as; the image has no plugins directory, so Docker would create the volume owned by root) by a one-shot init service, `lavalink-production-plugins` and `lavalink-staging-plugins`, which its Lavalink service waits for with `service_completed_successfully`. Starting one instance with `docker compose up -d lavalink-<instance>` also starts its init service, and nothing of the other instance. The init services are expected to show `Exited (0)`; the watchdog ignores services ending in `-plugins`. Both Lavalink services use the same log rotation and `no-new-privileges` as the main file.

Images:
- `build:` targets are included, so `docker compose ... build` builds both images from this checkout instead of pulling them.
- Until the 2.x images are published (STORY-127), build them that way.

Volumes:

| Volume | Mounted at | Used by |
|---|---|---|
| `postgres_data` | `/var/lib/postgresql/data` | postgres |
| `lavalink_plugins` | `/opt/Lavalink/plugins` | lavalink: plugins download once |
| `ririko_data` | `/app/data` | bot and web: card art in `data/tcg` |
| `card_images` | `/app/public/cards` | bot and web: rendered cards |
| `boss_images` | `/app/public/bosses` | bot |
| `welcomer_backgrounds` | `/app/storage/welcomer-backgrounds` | bot and web: uploaded welcome backgrounds |

- **Ownership:** the images run as uid 10001. A named volume starts owned by that user. If you replace one with a bind mount, make it writable first: `chown -R 10001:10001 <dir>`.
- **Upgrading from 1.4.0:** the 1.4.0 migration does not support a Postgres target yet (`docs/migrations.md` section 4.3), and this stack uses Postgres. Upgrade with the single-container SQLite compose in [docs/upgrading-from-1.4.md](upgrading-from-1.4.md) instead. The commented `./data:/app/legacy:ro` mount is for when Postgres targets are supported.

### 2.3. Upgrading a Self-Hosted Stack

This section is for anyone who runs `docker-compose.production.yml` (PostgreSQL) or the SQLite container of section 2.1 by hand. Hosts that deploy through CI use `ririko-deploy`, which migrates as its own gated step ([release.md section 8.6](release.md#86-migrations-on-a-host)).

- **Upgrades migrate on start.** `DB_AUTO_MIGRATE` defaults to `true`, so `docker compose -f docker-compose.production.yml --env-file .env.production pull` followed by the same command with `up -d` upgrades the stack across any number of versions, with no other step. The bot applies the pending migrations before it starts its services, one transaction each (under an advisory lock on PostgreSQL, so two processes never migrate at once), and the dashboard answers not ready until it has finished. A migration that fails leaves the database at the last migration that succeeded, and the bot does not start on the old schema: read `docker compose logs bot`. To be able to go back to a known release, set `RIRIKO_VERSION` to an exact version (for example `2.1.3`) instead of the moving default `2`.
- **PostgreSQL: dump before you upgrade.** The runner makes no backup there, and migrations only add, so the previous release still runs on the new schema; but the dump is the only way back for a change that went wrong. In a shell, set the compose command once:

  ```bash
  COMPOSE="docker compose -f docker-compose.production.yml --env-file .env.production"
  $COMPOSE exec -T postgres sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > ririko-before-upgrade.dump
  ```

  To restore it, stop the writers, restore, and start the release the dump came from (`RIRIKO_VERSION=<old version>`):

  ```bash
  $COMPOSE stop bot web
  $COMPOSE exec -T postgres sh -c 'exec pg_restore --clean --if-exists --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < ririko-before-upgrade.dump
  RIRIKO_VERSION=<old version> $COMPOSE up -d
  ```

  The dump is in the custom format, so `pg_restore` reads it, not `psql`. Everything written after the dump is lost. [release.md section 8.7](release.md#87-restoring-the-pre-deploy-dump) has the long version.
- **SQLite: the backups are automatic.** When migrations are pending on an existing SQLite file, the runner first copies the database with `VACUUM INTO` to `backups/pre-migrate-<UTC timestamp>.sqlite` in a `backups` folder next to the database file, and keeps the newest five. In the images that is `/app/data/backups/`, inside the `ririko_data` volume (`./data/backups/` in development). The first start of a database from before migration records is covered too. A new empty database, or one with nothing pending, gets no backup. To go back, stop the bot and the dashboard, copy a backup over the database file (`/app/data/ririko.sqlite` by default), delete the `-wal` and `-shm` files next to it, and start the previous version.
- **Running the migrations by hand.** Set `DB_AUTO_MIGRATE=false` in `.env.production` (or the container's environment). The bot then only checks the schema: it exits with a message that names the pending migrations instead of starting on an old schema. Upgrade in this order (`run` starts Postgres if it is not up), with `$COMPOSE` set as above:

  ```bash
  $COMPOSE pull
  $COMPOSE run --rm bot ririko db:migrate
  $COMPOSE up -d
  ```

  `ririko db:migrate --status` prints the latest, pending and unknown ids, and `--dry-run` prints the plan, including what adopting an old database would change; neither changes anything. Exit code 0 is done or nothing to do, 1 a failure, and 2 the downgrade guard (the database holds a contract migration this release does not know: run the newer release, or restore the dump). On a single container, `docker exec <bot container> ririko db:migrate` does the same.

---

## 3. Observability & Health Monitoring

Both containers answer HTTP probes. Docker uses `/health` as their `HEALTHCHECK`; orchestrators can route traffic on `/ready`.

| Container | Address | `/health` | `/ready` |
|---|---|---|---|
| Bot | port `HEALTH_PORT` (default 8080, `0` turns it off), not published | 200 while the database answers, else 503 | 200 once startup finished (schema, 1.4.0 upgrade, services, listeners), the database answers and the Discord gateway is `READY`, else 503 |
| Dashboard | port 3000 (`/health`, `/ready`, or `/api/health`, `/api/ready`) | liveness: 200 while the database answers, and also while its schema is only behind (migrations pending); 503 when the database cannot be reached | 200 while the database answers and the schema is current, else 503 (also while migrations are pending) |

Bot `/health` body:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "uptimeSeconds": 14205,
  "discord": { "status": "READY", "pingMs": 32 },
  "database": { "status": "CONNECTED", "latencyMs": 4 }
}
```
- When the database fails, `status` is `unhealthy`, `database.status` is `UNREACHABLE`, and the body includes the driver error. The bot port is internal, so the error text is safe to show.
- `/ready` answers `{ "ready": false, "started": true, "discord": "CONNECTING", "database": true }`, so you can see why it is not ready.

The dashboard is public, so its probes never include error text. `/health` answers `{ status, version, uptimeSeconds, database: { status, latencyMs } }` and `/ready` answers `{ "ready": true }`. Failures are written to the server log.

While migrations are pending, `/health` stays 200 and reports `database: { status: "MIGRATION_PENDING", pending: ["0000_baseline"] }` (the migration ids are not sensitive), and `/ready` answers 503 and logs which migrations are pending. Liveness must not fail then: Docker would mark the container unhealthy and the host watchdog would restart it while the bot is still migrating. A database that cannot be reached still fails both probes. `scripts/docker-smoke.ts` checks both states: the dashboard on an empty database (live, not ready) and on a database migrated by the bot image (everything answers).

---

## 4. Current Hosting

Production and staging run on AWS Lightsail behind Cloudflare Tunnel, with Lavalink on a separate VPS over WireGuard and releases deployed by CircleCI. The step-by-step setup (provider resources, tunnels and access policies, host configuration, CI contexts, go-live, recovery and the secret inventory) is the private hosting runbook, `docs/hosting.md`, which is not in the repository because it holds account and network details. The decision and the rejected options are in [ADR-014](adr/ADR-014-production-hosting-lightsail-cloudflare-tunnel.md); the release pipeline and its exit codes are in [release.md section 8](release.md#8-deploy-to-staging-and-production).

The Vercel project `ririko-bot` still deploys a static project status page (it hosts neither the bot nor the dashboard):
- `vercel.json` skips dependency installation and runs `scripts/build-status-site.ts` with Node's TypeScript type stripping. The script reads `docs/kanban/board.json` and the `docs/` tree and writes `site-dist/index.html`.
- Every branch gets a preview URL, so each PR shows the board as it stands on that branch.
- Vercel project settings must leave Root Directory empty, use the "Other" framework preset and have no install, build or output overrides, so `vercel.json` applies.
- Preview locally with `pnpm site:build`.
