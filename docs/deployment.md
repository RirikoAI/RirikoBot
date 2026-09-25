# Production Deployment & Infrastructure Runbook (Ririko AI 2.0.0)

## 1. Overview & Sane Infrastructure Defaults
In strict accordance with Section 68 and 69 of `BLUEPRINT.md`: **Do not over-engineer deployment.**
- Ririko AI 2.0.0 avoids excessive cloud microservices, Kubernetes clusters, and message bus sprawl.
- The standard production deployment consists of two containerized applications (`bot` and `web`), a PostgreSQL database, a Redis cache/queue, and an optional Lavalink audio node.
- Self-hosters can run the entire platform on a single lightweight VPS using SQLite and local audio extraction without Docker dependencies if desired.

---

## 2. Docker Architecture

### 2.1. Multi-Stage Containerization (`Dockerfile`)
- **Base**: `node:22-bookworm-slim` or `node:24-bookworm-slim`.
- **Precompiled Native Dependencies**: Because `@napi-rs/canvas` uses precompiled Rust Skia binaries, the Docker build does NOT require `libcairo2-dev` or `libpango1.0-dev`.
- **Security**: Runs under a non-root unprivileged `ririko` user (`USER 10001:10001`).
- **FFmpeg**: Bundled for reliable audio stream decoding.

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
  postgres_data:
  redis_data:
  asset_cache:
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
