# Production Deployment & Infrastructure Runbook (Ririko AI 2.0.0)

## 1. Overview & Sane Infrastructure Defaults
In strict accordance with Section 68 and 69 of `BLUEPRINT.md`: **Do not over-engineer deployment.**
- Ririko AI 2.0.0 avoids excessive cloud microservices, Kubernetes clusters, and message bus sprawl.
- The standard production deployment consists of two containerized applications (`bot` and `web`), a PostgreSQL database, a Redis cache/queue, and an optional Lavalink audio node.
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
- **Upgrading from 1.4.0**: mount the old `./data` folder read-only at `/app/legacy` (`./data:/app/legacy:ro`). The bot image sets `LEGACY_DATABASE_PATH=/app/legacy/ririko.db` and migrates that database once on first start, without writing to it. See [docs/migrations.md section 4](migrations.md).

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
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: ririko
      POSTGRES_USER: ririko
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ririko"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  bot:
    build:
      context: .
      target: bot-runner
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://ririko:${DB_PASSWORD}@postgres:5432/ririko
      REDIS_URL: redis://redis:6379
      DISCORD_TOKEN: ${DISCORD_TOKEN}
      DISCORD_CLIENT_ID: ${DISCORD_CLIENT_ID}
      ENCRYPTION_SECRET: ${ENCRYPTION_SECRET}
    volumes:
      - asset_cache:/app/assets/cache
      - welcomer_backgrounds:/app/storage/welcomer-backgrounds

  web:
    build:
      context: .
      target: web-runner
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://ririko:${DB_PASSWORD}@postgres:5432/ririko
      DISCORD_CLIENT_ID: ${DISCORD_CLIENT_ID}
      DISCORD_CLIENT_SECRET: ${DISCORD_CLIENT_SECRET}
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXTAUTH_URL: ${NEXTAUTH_URL}
    volumes:
      # Welcome and farewell backgrounds uploaded on the dashboard; the bot draws the cards
      # from the same files, so both containers mount this volume.
      - welcomer_backgrounds:/app/storage/welcomer-backgrounds

volumes:
  postgres_data:
  redis_data:
  asset_cache:
  welcomer_backgrounds:
```

---

## 3. Observability & Health Monitoring (Section 57)

The application provides HTTP health and readiness probes for monitoring and container orchestrators:
- `GET /health` — Returns `200 OK` with JSON payload:
  ```json
  {
    "status": "healthy",
    "version": "2.0.0",
    "uptimeSeconds": 14205,
    "discord": { "status": "CONNECTED", "pingMs": 32, "shards": 2 },
    "database": { "status": "CONNECTED", "latencyMs": 4 },
    "redis": { "status": "CONNECTED" },
    "providers": {
      "gemini": "HEALTHY",
      "twitch": "HEALTHY"
    }
  }
  ```
- `GET /ready` — Evaluates whether all initial database migrations have completed and Discord Gateway shard handshakes are established before traffic routing.

---

## 4. Current Hosting: Vercel Status Site

The bot and dashboard are not hosted yet (STORY-121 and STORY-122 add the containers). Until then the Vercel project `ririko-bot` deploys only a static project status page:
- `vercel.json` skips dependency installation and runs `scripts/build-status-site.ts` with Node's TypeScript type stripping. The script reads `docs/kanban/board.json` and the `docs/` tree and writes `site-dist/index.html`.
- Every branch gets a preview URL, so each PR shows the board as it stands on that branch.
- Vercel project settings must leave Root Directory empty, use the "Other" framework preset and have no install, build or output overrides, so `vercel.json` applies.
- Preview locally with `pnpm site:build`.
