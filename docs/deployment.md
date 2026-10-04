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
| `bot-deps`, `web-deps` | Production dependencies of `@ririko/bot` or `@ririko/web` and the workspace packages each uses (`--prod --ignore-scripts`). |
| `runtime` | `node:22-bookworm-slim` with `tini`, `fonts-dejavu-core` and `ca-certificates`, and the `ririko` user (uid/gid 10001). No pnpm, no compilers. |
| `bot-runner` | `runtime` plus FFmpeg, the bot's `node_modules`, `dist` folders and `assets/`. Runs `node apps/bot/dist/main.js`. |
| `web-runner` | `runtime` plus the dashboard's `node_modules`, `.next`, `next.config.ts` (and the file it imports) and `assets/tcg`. Runs `next start` on port 3000 from `/app/apps/web`. |

- **BuildKit**: the dependency installs use a BuildKit cache mount for the pnpm store, so builds need BuildKit (the default builder since Docker Engine 23, through the buildx plugin).
- **No compilers**: `better-sqlite3` and `@napi-rs/canvas` ship prebuilt binaries, so the images need neither build tools nor `libcairo2-dev`/`libpango1.0-dev`.
- **Monorepo layout**: the images keep the repository layout at `/app` (with `pnpm-workspace.yaml`), so `assets/`, `data/`, `public/cards`, `public/bosses` and `storage/` resolve as they do in development.
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
- the dashboard loads its native packages, answers `GET /` with 200, redirects `/api/auth/login` to Discord and creates its SQLite database.

### 2.2. Production Orchestration (`docker-compose.production.yml`)

`docker-compose.production.yml` runs the whole stack on one host:

| Service | Image | Role |
|---|---|---|
| `postgres` | `postgres:16-alpine` | The database. Healthy when `pg_isready` answers. |
| `lavalink` | `ghcr.io/lavalink-devs/lavalink:4` | Audio node. Uses `docker/lavalink/application.yml`, the same config `pnpm lavalink:install` writes, with the secrets read from its environment. |
| `bot` | `ririkoai/ririkobot:${RIRIKO_VERSION:-2}` | The Discord bot. Starts once Postgres is healthy. |
| `web` | `ririkoai/ririkobot-dashboard:${RIRIKO_VERSION:-2}` | The dashboard, published on `${DASHBOARD_BIND:-127.0.0.1}:${DASHBOARD_PORT:-3000}`. |

Start it:
1. Copy `.env.production.example` to `.env.production`.
2. Fill in the required values: the Discord credentials, `DASHBOARD_URL`, `SECRET_VAULT_KEY` (`openssl rand -hex 32`), `POSTGRES_PASSWORD` and `LAVALINK_PASSWORD`.
3. Run `docker compose -f docker-compose.production.yml --env-file .env.production up -d`.

What happens on startup:
- Every service reads `.env.production`, or the file named by `RIRIKO_ENV_FILE`.
- The compose file sets the values that must point inside the stack itself: `DATABASE_DIALECT=postgres`, `DATABASE_URL` (built from the `POSTGRES_*` values), `LAVALINK_HOST=lavalink` and `LAVALINK_PORT=2333`.
- On the first start the bot or the dashboard creates the schema in the empty database (`ensurePostgresSchema`, see `docs/database.md` section 1).
- Both images have a `HEALTHCHECK` (section 3).
- Compose refuses to start when `POSTGRES_PASSWORD` or `LAVALINK_PASSWORD` is empty.

Hardening (a test in `scripts/compose-production.test.ts` parses the file and keeps these settings from regressing):
- **Dashboard port:** published on loopback only (`DASHBOARD_BIND=127.0.0.1`), so it is reachable from the host itself and from nothing else. Put a reverse proxy or a tunnel on the host in front of it. To reach it on the LAN or from the internet, set `DASHBOARD_BIND=0.0.0.0`, and only on a host whose own firewall or reverse proxy protects the port. `DASHBOARD_PORT` still sets the host port.
- **Client IP header:** `CLIENT_IP_HEADER` (optional) names the one request header the dashboard trusts for the client address. It keys the sign-in, probe and pre-sign-in action rate limits and fills the session and audit records. Unset, the dashboard uses the first `X-Forwarded-For` entry, which Cloudflare does not overwrite (it appends the real address to whatever the client sent), so that entry is attacker-controlled behind Cloudflare and a client can pick its own rate-limit bucket. Set `CLIENT_IP_HEADER=cf-connecting-ip` there: Cloudflare sets that header itself. The value must be a valid IPv4 or IPv6 address, otherwise the client IP is empty (shared `unknown` bucket); there is no fallback to `X-Forwarded-For` or `X-Real-IP`. Set it only when every request reaches the dashboard through Cloudflare (a tunnel with the loopback binding above): on any other path a client sends the header itself. Requests without it, such as the container `HEALTHCHECK` and the deploy readiness poll, share one `unknown` bucket, which the probe limit (30 burst, 1 per second) covers. A malformed name stops the dashboard at startup.
- **Capabilities:** `bot` and `web` run with `cap_drop: [ALL]`: both images run as uid 10001 and use no Linux capability. `postgres` and `lavalink` keep theirs, because the Postgres entrypoint chowns its data directory and switches user.
- **Privileges:** all four services set `security_opt: [no-new-privileges:true]`, so no process in them can gain privileges through a setuid binary.
- **Log rotation:** all four services share one `x-logging` anchor: the `local` driver, `max-size: 20m`, `max-file: 5`. A service keeps at most 100 MB of logs.
- **Lavalink heap:** `LAVALINK_HEAP` sets the JVM maximum heap (`-Xmx`, default `1G`). Use `512m` on a host with 4 GB of memory.

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

---

## 3. Observability & Health Monitoring

Both containers answer HTTP probes. Docker uses `/health` as their `HEALTHCHECK`; orchestrators can route traffic on `/ready`.

| Container | Address | `/health` | `/ready` |
|---|---|---|---|
| Bot | port `HEALTH_PORT` (default 8080, `0` turns it off), not published | 200 while the database answers, else 503 | 200 once startup finished (schema, 1.4.0 upgrade, services, listeners), the database answers and the Discord gateway is `READY`, else 503 |
| Dashboard | port 3000 (`/health`, `/ready`, or `/api/health`, `/api/ready`) | 200 while the database answers, else 503 | the same |

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

---

## 4. Current Hosting: Vercel Status Site

The bot and dashboard are not hosted yet (STORY-121 and STORY-122 add the containers). Until then the Vercel project `ririko-bot` deploys only a static project status page:
- `vercel.json` skips dependency installation and runs `scripts/build-status-site.ts` with Node's TypeScript type stripping. The script reads `docs/kanban/board.json` and the `docs/` tree and writes `site-dist/index.html`.
- Every branch gets a preview URL, so each PR shows the board as it stands on that branch.
- Vercel project settings must leave Root Directory empty, use the "Other" framework preset and have no install, build or output overrides, so `vercel.json` applies.
- Preview locally with `pnpm site:build`.
