# Deploying the implemented Ririko foundation

This deployment runs the implemented Discord bot and operator CLI. It does not deploy a dashboard or claim full 1.4.0 feature parity. See [the roadmap](implementation-roadmap.md) for delivered behavior and outstanding modules.

The image uses Node **24.19.0-bookworm-slim** and pnpm **10.34.5**. Native SQLite builds have Python, make and g++ available in build/install stages. The final image runs as the `node` user, includes compiled applications plus production workspace dependencies, and stores writable state in `/app/data`. It does not install TypeScript, Vitest or compilers in the final stage. Separate production dependency installation preserves pnpm workspace links; see [pnpm 10's Docker guidance](https://pnpm.io/10.x/docker).

Compose uses **PostgreSQL 18.6**, released 2026-08-13, within the requested technology cutoff. PostgreSQL 18's official image stores its major-version data directory beneath the **/var/lib/postgresql** volume; do not reuse older mount instructions targeting only /var/lib/postgresql/data. [Release evidence](https://www.postgresql.org/docs/release/18.6/), [official image instructions](https://hub.docker.com/_/postgres).

## Configure and build

Use Docker Engine/Desktop with Linux containers and the Compose plugin. Ensure outbound Discord Gateway/REST and package/image registry access. The bot needs a Discord application/token and the intents required by its implemented prefix routing. Keep the privileged Message Content intent enabled when using prefix commands.

Create a private root `.env.deploy` file. It is ignored by Git and the Docker build context. Populate these values locally; never commit actual credentials:

```dotenv
POSTGRES_PASSWORD=replace-with-random-database-admin-password
DATABASE_URL=postgres://ririko:URL_ENCODED_APPLICATION_PASSWORD@postgres:5432/ririko
DISCORD_TOKEN=replace-with-discord-bot-token
DISCORD_APPLICATION_ID=replace-with-discord-application-snowflake
BOT_OWNER_IDS=
DEFAULT_PREFIX=!
LOG_LEVEL=info
```

The database administrator password and application password are distinct. URL-encode reserved characters in the application URL. Compose interpolation loads the file; it does not place it into the image. Protect host access: container administrators can inspect environment values. No database or health port is published by default.

```sh
docker compose --env-file .env.deploy config --quiet
docker compose --env-file .env.deploy build
docker compose --env-file .env.deploy up -d --wait postgres
```

On first initialization, create a non-superuser application role using the database administrator session:

```sh
docker compose --env-file .env.deploy exec postgres psql -U postgres -d ririko
```

Inside psql:

```sql
CREATE ROLE ririko LOGIN;
\password ririko
GRANT CONNECT ON DATABASE ririko TO ririko;
GRANT USAGE, CREATE ON SCHEMA public TO ririko;
\q
```

The password prompt avoids putting the raw application password in a shell command. Use the same password, URL-encoded, in DATABASE_URL. The application role creates and owns its migrated tables without cluster-superuser privileges. Role creation is a first-install step; do not repeat it on an existing cluster.

## Migrate, diagnose and start

Run schema migration explicitly before starting the bot:

```sh
docker compose --env-file .env.deploy run --rm --no-deps bot node apps/cli/dist/index.js migrate
docker compose --env-file .env.deploy run --rm --no-deps bot node apps/cli/dist/index.js doctor
docker compose --env-file .env.deploy up -d bot
docker compose --env-file .env.deploy logs --tail 100 bot
```

The `migrate` command initializes/updates the foundation schema. It is **not** the legacy data importer. Do not point it at a legacy database or treat schema creation as verified 1.x migration. Legacy cutover is governed by the [migration specification](migration-1.x-to-2.0.md).

Do not auto-run migration in the bot entrypoint. Upgrade one schema owner at a time and inspect failures before starting the application. `doctor` reports configuration/database checks, fails when required credentials are absent, and does not prove a live Discord login.

Inspect registered commands before synchronizing them to a development guild:

```sh
docker compose --env-file .env.deploy run --rm --no-deps bot node apps/cli/dist/index.js command:list --json
docker compose --env-file .env.deploy run --rm --no-deps -e DISCORD_GUILD_ID=REPLACE_WITH_GUILD_SNOWFLAKE bot node apps/cli/dist/index.js command:sync
```

`command:sync --global` explicitly updates global slash registration; perform it only after reviewing command metadata and intended rollout. Synchronization is separate from starting the gateway. It has not been executed against Discord during this development task.

Other operator commands include `migrate:status`, `health`, `module:list`, `module:enable <guildId> <module>`, `module:disable <guildId> <module>`, and `guild:config <guildId> [--prefix <value>]`. Currently the implemented `core` module is essential. The local CLI is a trusted host-administration interface: configuration writes require BOT_OWNER_IDS and attribute the change to its first configured owner. Host access itself grants the ability to invoke this interface; it is not an OAuth-authenticated remote endpoint. Restrict host/container administration accordingly.

## Health and shutdown

Liveness is `/health/live`; readiness is `/health/ready` on 127.0.0.1:3001 **inside the container**. Readiness checks Discord/database availability. The image healthcheck queries readiness with a bounded timeout.

```sh
docker compose --env-file .env.deploy exec bot node -e "fetch('http://127.0.0.1:3001/health/ready').then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))"
docker compose --env-file .env.deploy stop bot
```

Compose gives the bot 30 seconds for SIGTERM shutdown and uses an init process to forward signals/reap children. An unhealthy status alone does not make Docker restart a process; `restart: unless-stopped` handles process exits. Investigate persistent readiness failures through logs and diagnostics instead of repeatedly restarting.

The bot root filesystem is read-only under Compose, with a bounded /tmp tmpfs and writable /app/data volume. Do not change HEALTH_HOST without adapting the image healthcheck and network exposure deliberately.

## SQLite for one bot process

SQLite is suitable for a single bot process with persistent storage. Build the same image and create a separate private `.env.sqlite` file:

```dotenv
DATABASE_DIALECT=sqlite
DATABASE_URL=/app/data/ririko.db
DISCORD_TOKEN=replace-with-discord-bot-token
DISCORD_APPLICATION_ID=replace-with-discord-application-snowflake
DEFAULT_PREFIX=!
LOG_LEVEL=info
```

Use one named volume for migration and runtime:

```sh
docker build --target runtime -t ririko:2.0.0 .
docker volume create ririko-sqlite
docker run --rm --env-file .env.sqlite -v ririko-sqlite:/app/data ririko:2.0.0 node apps/cli/dist/index.js migrate
docker run --rm --env-file .env.sqlite -v ririko-sqlite:/app/data ririko:2.0.0 node apps/cli/dist/index.js doctor
docker run -d --name ririko-sqlite --init --restart unless-stopped --stop-timeout 30 --read-only --tmpfs /tmp:size=64m,mode=1777 --env-file .env.sqlite -v ririko-sqlite:/app/data ririko:2.0.0
```

Named-volume ownership is initialized from /app/data in the image. A host bind mount instead requires host permissions allowing container UID/GID 1000 to write. Do not run simultaneous bot replicas against this SQLite volume.

## Backup, restore and upgrade

Use verified backups before schema changes. A backup is not validated until it has been restored into a separate database and its expected data checked.

For PostgreSQL, produce the archive inside the container and copy the file to the host; this avoids shell-dependent binary redirection:

```sh
mkdir -p data/backups
docker compose --env-file .env.deploy exec postgres pg_dump -U postgres -d ririko -Fc -f /tmp/ririko-backup.dump
docker compose --env-file .env.deploy cp postgres:/tmp/ririko-backup.dump ./data/backups/ririko-backup.dump
```

The local data/backups directory is excluded from Git and the Docker context. Protect the copied archive and move a copy to private off-host backup storage. On an isolated database, rehearse restoring the archive with `pg_restore --no-owner --role=ririko` after creating the application role and empty database. Confirm schema version, row counts and configuration values; do not overwrite the running database to test restoration. For live production backups, use an external backup schedule, retention and monitoring policy.

For SQLite, stop the bot, copy the **entire stopped data directory** (including any WAL/SHM companions), and restart it only after the copy completes. Restore into a separate named volume and run diagnostics/verification. Copying only the live .db file can omit committed WAL data.

For an upgrade: review changed dependencies/security releases, build a new image, back up and rehearse migration, stop the bot, run the explicit schema migration, start the new image, and inspect readiness/logs. If rollback needs database restoration, stop all writers first. A restored backup loses writes made since that backup; document that window and avoid promising lossless rollback after new production activity.

Keep the PostgreSQL data and bot-data volumes when removing containers. `docker compose down` preserves named volumes by default; deleting volumes removes persistent state. Database major upgrades need the PostgreSQL-supported upgrade or dump/restore process, not just an image-tag change.

## CI and verification status

CI uses isolated PostgreSQL test data and runs lint, typecheck, unit, integration, end-to-end and build scripts, followed by Compose validation, a production image build and offline SQLite migration/diagnostics in a container with a read-only root filesystem. Test credentials in CI are disposable fixture values, not production credentials. Workflow Actions are pinned to verified release commits: [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) and [setup-node v6.5.0](https://github.com/actions/setup-node/releases/tag/v6.5.0).

On this development host, Compose configuration can be validated, but the Docker daemon is unavailable. Therefore no local Linux container build, container-native SQLite installation, authenticated Discord login, live readiness, volume persistence or restore rehearsal has been claimed. CI configuration defines these checks where possible; it does not prove a remote CI run occurred. Complete the remaining deployment checks before a production cutover.
