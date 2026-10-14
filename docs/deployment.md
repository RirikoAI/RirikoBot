# Deploy Ririko With Docker

This guide takes you from nothing to a running Ririko bot and dashboard on one machine. It uses Docker Compose. The stack has four services: the bot, the dashboard, a PostgreSQL database and a Lavalink audio server.

Other guides:

- To run Ririko without Docker, read [SETUP.md](../SETUP.md).
- To upgrade a Ririko 1.4.0 bot, read [upgrading-from-1.4.md](upgrading-from-1.4.md).
- To release Ririko and deploy it with CI, read [release.md](release.md).

---

## 1. What You Need

- A computer or server that runs Linux, macOS or Windows with Docker. Use a Linux server for a bot that stays online all the time.
- Docker Engine 23 or newer, with the Compose plugin (Compose v2). Docker Desktop includes both.
- Git.
- `openssl`, to make secret keys. Git for Windows includes it.
- A Discord account.

---

## 2. Install Ririko

### 2.1. Check Docker

1. Run this command:

   ```bash
   docker compose version
   ```

   You see a line that starts with `Docker Compose version v2`. If the command fails, install Docker first: <https://docs.docker.com/engine/install/>.

### 2.2. Create the Discord application

#### With the wizard

The setup wizard in section 2.4 shows you these steps in your browser, with a guide button on each page. You can skip this section. Do section 2.3 first, then go to section 2.4.

#### Without the wizard

1. Open <https://discord.com/developers/applications> and click **New Application**. Give it a name.
2. Open the **General Information** tab. Copy the **Application ID**. This is your `DISCORD_CLIENT_ID`.
3. Open the **Bot** tab. Click **Reset Token** and copy the token. This is your `DISCORD_TOKEN`. Keep it secret: anyone who has it controls your bot.
4. On the same tab, turn on **Server Members Intent** and **Message Content Intent**. Click **Save Changes**. Prefix commands, levels and moderation need these two intents.
5. Open the **OAuth2** tab. Click **Reset Secret** and copy the client secret. This is your `DISCORD_CLIENT_SECRET`.
6. On the same tab, under **Redirects**, click **Add Redirect** and enter `http://localhost:3000/api/auth/callback`. Click **Save Changes**. If you will use a public address for the dashboard, see section 4 first and enter that address instead.

### 2.3. Get the files

1. Download the repository:

   ```bash
   git clone https://github.com/RirikoAI/RirikoBot.git
   ```

2. Go into the folder:

   ```bash
   cd RirikoBot
   ```

3. Switch to the release you want to run. This makes the compose file match the image version:

   ```bash
   git checkout v2.0.0
   ```

### 2.4. Write the settings file

#### With the wizard: the "ririko setup --docker" one-liner

The wizard runs in a short-lived container. It asks for your values in the browser, checks them, and writes `.env.production`. It also makes the vault key, the Lavalink password and the database password for you. You need only Docker.

1. In the folder from section 2.3, run this command (PowerShell and Bash):

   ```bash
   docker run --rm -it -p 127.0.0.1:3999:3999 -v "$PWD:/setup" ririkoai/ririkobot:2 ririko setup --docker --env-file /setup/.env.production --listen 0.0.0.0 --no-open
   ```

   Docker downloads the image on the first run. The terminal then prints `RirikoAI setup (docker install)` and an address that starts with `http://127.0.0.1:3999/`.

2. Copy that address into your browser.
3. Follow the pages in order: **Welcome**, **Discord Bot**, **AI**, **Stream Alerts**, **Database & Music**, **Dashboard** and **Install**. The wizard checks the bot token and the dashboard client secret before you can go on. With Docker the dashboard is always on.
4. On the **Install** page, read the summary, tick both boxes, and click **Finish**. The wizard writes `.env.production` in the current folder. If the file already exists, the wizard keeps your values and saves a copy named `.env.production.bak-` and a time stamp.
5. If the page says the file could not be written, click **Download the file** instead. Save it as `.env.production` in the folder from section 2.3. The mounted folder can be read-only for the user inside the image.
6. The terminal prints `Setup finished` and the container stops. Make sure the redirect from section 2.2, step 6 is in your Discord application, then continue with section 2.5.

Notes:

- Always pass `--env-file /setup/.env.production`. Without it, the wizard tries to write inside the image, where it cannot.
- The port is published to `127.0.0.1` only. Do not publish it to other machines: the wizard shows secrets and writes your settings file.
- To use another port, change both numbers in `-p` and add `--port <number>`. [development.md](development.md#4-the-ririko-command-line-tool) lists every option of `ririko setup`.

#### Without the wizard

1. Copy the example file:

   ```bash
   cp .env.production.example .env.production
   ```

2. Make a vault key. The dashboard uses it to encrypt stored data:

   ```bash
   openssl rand -hex 32
   ```

   You see 64 characters. Copy them. Keep a safe copy of this key: if you lose it, the stored credentials cannot be read again.

3. Make a Lavalink password:

   ```bash
   openssl rand -hex 32
   ```

4. Make a database password:

   ```bash
   openssl rand -hex 32
   ```

5. Open `.env.production` in a text editor and fill in these seven values. Do not add spaces or quotes.

   | Variable | Value |
   | --- | --- |
   | `DISCORD_TOKEN` | The bot token from step 2.2. |
   | `DISCORD_CLIENT_ID` | The application ID from step 2.2. |
   | `DISCORD_CLIENT_SECRET` | The client secret from step 2.2. |
   | `DASHBOARD_URL` | `http://localhost:3000` if you open the dashboard on the same machine. For a public address, see section 4. |
   | `SECRET_VAULT_KEY` | The first key from this section. |
   | `LAVALINK_PASSWORD` | The second key from this section. |
   | `POSTGRES_PASSWORD` | The third key from this section. |

6. Optional: set `BOT_OWNER_ID` to your Discord user ID. To copy your ID, turn on Developer Mode in Discord (**User Settings**, **Advanced**), then right-click your name and click **Copy User ID**. Owners can open the owner console of the dashboard.

Section 7 lists every other setting.

### 2.5. Start the stack

1. Start all services in the background:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production up -d
   ```

   Docker downloads the images and creates the containers. The first start takes a few minutes. The command ends when all containers are started.

2. Check the containers:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production ps
   ```

   After about two minutes, `postgres`, `bot` and `web` show `healthy`. `lavalink` shows `running`. The small helper service `lavalink-plugins` is not in this list, because it runs once and stops.

3. Read the bot log:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production logs bot
   ```

   You see `Logged in as` followed by your bot name. On the first start, you also see lines about the database migrations that were applied.

### 2.6. Add the bot to your server

1. In the Developer Portal, open **OAuth2**, then **URL Generator**.
2. Select the scopes `bot` and `applications.commands`.
3. Select the permission `Administrator`. This is the simplest choice. You can give fewer permissions later.
4. Copy the generated URL, open it in your browser and add the bot to your server.

### 2.7. Register the slash commands

1. Run this command once:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production exec bot ririko commands:sync --global --all-guilds
   ```

   The command prints the commands it registered. Global commands can take a while to show in Discord. Press Ctrl+R in Discord to refresh.

2. In your server, type `/ping`. The bot answers.

The bot registers the admin commands by itself each time it joins a new server. You only repeat step 1 after an upgrade that adds commands.

### 2.8. Open the dashboard

1. Open <http://localhost:3000> in Chrome or Firefox.
2. Click **Sign in with Discord** and approve the request. You see the list of servers where you can manage the bot.

If the sign-in fails with a redirect error, the redirect in step 2.2 does not match `DASHBOARD_URL`. They must match exactly.

---

## 3. Run Commands in the Containers

The bot image includes the `ririko` command-line tool. Run it inside the running bot container:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production exec bot ririko --help
```

The list shows every command. Some useful ones:

| Command | What it does |
| --- | --- |
| `ririko doctor` | Checks the settings, the database and the Discord login. |
| `ririko db:migrate --status` | Shows the database migrations that are applied and pending. |
| `ririko commands:sync` | Shows how many slash command slots are used. Add `--global --all-guilds` to register the commands. |
| `ririko passkeys:reset <user_id>` | Shows how many passkeys a user has. Add `--yes` to remove them. |

The dashboard image has no command-line tool.

---

## 4. Show the Dashboard on the Internet

The dashboard listens on `127.0.0.1` only. Only the machine itself can reach it. To share it, put a reverse proxy or a tunnel on the machine in front of it.

1. Choose a public HTTPS address, for example `https://dashboard.example.com`.
2. Set up your reverse proxy or tunnel so that it forwards that address to `http://127.0.0.1:3000`.
3. In the Developer Portal, open **OAuth2** and add `https://dashboard.example.com/api/auth/callback` under **Redirects**. Click **Save Changes**.
4. In `.env.production`, set `DASHBOARD_URL=https://dashboard.example.com`.
5. If every request reaches the dashboard through Cloudflare, also set `CLIENT_IP_HEADER=cf-connecting-ip`. Cloudflare sets this header itself, so a visitor cannot fake it. Do not set it on any other setup: a visitor could then choose their own address and avoid the rate limits. The value must be a valid IP address.
6. Apply the change:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production up -d
   ```

   Compose recreates only the containers whose settings changed.

Do not set `DASHBOARD_BIND=0.0.0.0` unless the firewall of the machine, or a reverse proxy on another machine, protects the port. `DASHBOARD_PORT` sets the port on the machine (default `3000`).

---

## 5. Upgrade

The bot applies new database migrations by itself when it starts. The dashboard waits until the database is current.

1. Make a database dump. This is your only way back if an upgrade goes wrong:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production exec -T postgres sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > ririko-before-upgrade.dump
   ```

   The file `ririko-before-upgrade.dump` is not empty.

2. Get the new compose file. Replace `v2.0.1` with the new version:

   ```bash
   git fetch --tags
   ```

   ```bash
   git checkout v2.0.1
   ```

3. In `.env.production`, set `RIRIKO_VERSION=2.0.1`. An exact version lets you go back to a known release. The default `2` always means the newest 2.x release.
4. Download the new images:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production pull
   ```

5. Start the new version:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production up -d
   ```

6. Read the bot log. It shows the migrations that were applied:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production logs bot
   ```

If a migration fails, the database stays at the last migration that worked, and the bot does not start. The log shows the reason.

### 5.1. Run the migrations yourself

Do this if you want to control when the database changes.

1. In `.env.production`, set `DB_AUTO_MIGRATE=false`. The bot now only checks the database. If migrations are pending, it stops and names them.
2. Download the new images:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production pull
   ```

3. Show what the migration would do. This changes nothing:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production run --rm bot ririko db:migrate --dry-run
   ```

4. Apply the migrations:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production run --rm bot ririko db:migrate
   ```

5. Start the new version:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production up -d
   ```

The command `ririko db:migrate` ends with one of these exit codes:

| Exit code | Meaning |
| --- | --- |
| 0 | The migrations are applied, or there was nothing to do. |
| 1 | The command failed. Read the message. |
| 2 | The database holds a change that this release does not know. Run the newer release, or restore the dump. Nothing was changed. |

### 5.2. Restore the dump

This removes everything written after the dump.

1. Stop the bot and the dashboard:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production stop bot web
   ```

2. Restore the dump:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production exec -T postgres sh -c 'exec pg_restore --clean --if-exists --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < ririko-before-upgrade.dump
   ```

   The dump uses the custom format. Only `pg_restore` can read it.

3. Set `RIRIKO_VERSION` in `.env.production` to the version that made the dump, and run `git checkout` for the same version.
4. Start the stack:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production up -d
   ```

---

## 6. Health Checks

Both containers answer HTTP checks. Docker uses `/health` as the container health check. Tools that route traffic can use `/ready`.

| Container | Address | `/health` | `/ready` |
| --- | --- | --- | --- |
| Bot | Port `HEALTH_PORT` (default `8080`, `0` turns it off). Docker does not publish it. | `200` while the database answers, otherwise `503`. | `200` when startup is done, the database answers and Discord is connected, otherwise `503`. |
| Dashboard | Port `3000`: `/health` and `/ready`, or `/api/health` and `/api/ready`. | `200` while the database answers, also while migrations are pending. `503` if the database cannot be reached. | `200` while the database answers and the schema is current, otherwise `503`. |

The bot `/health` answer looks like this:

```json
{
  "status": "healthy",
  "version": "2.0.0",
  "uptimeSeconds": 14205,
  "discord": { "status": "READY", "pingMs": 32 },
  "database": { "status": "CONNECTED", "latencyMs": 4 }
}
```

- If the database fails, `status` is `unhealthy`, `database.status` is `UNREACHABLE`, and the answer includes the driver error. The bot port is private, so the error is safe to show.
- If `/ready` answers `503`, the body shows why, for example `{ "ready": false, "started": true, "discord": "CONNECTING", "database": true }`.

The dashboard is public, so its answers never include error text. `/health` answers `{ status, version, uptimeSeconds, database: { status, latencyMs } }`. `/ready` answers `{ "ready": true }`. The server log has the details.

While migrations are pending, the dashboard `/health` stays `200` and reports `database: { status: "MIGRATION_PENDING", pending: [...] }`. The `/ready` check answers `503` and the log names the pending migrations. This keeps Docker from restarting the dashboard while the bot is still migrating.

---

## 7. Settings Reference

The file `.env.production.example` lists every setting with a comment. The compose file sets these values itself, so do not set them: `DATABASE_DIALECT`, `DATABASE_URL`, and `LAVALINK_HOST` and `LAVALINK_PORT` (unless you use section 8).

| Variable | Default | Meaning |
| --- | --- | --- |
| `DB_AUTO_MIGRATE` | `true` | The bot applies pending migrations at start. With `false` it only checks. |
| `RIRIKO_VERSION` | `2` | The image tag to run: `2`, `2.0` or an exact version such as `2.0.0`. |
| `DASHBOARD_BIND` | `127.0.0.1` | The address on the machine where the dashboard listens. |
| `DASHBOARD_PORT` | `3000` | The port on the machine where the dashboard listens. |
| `CLIENT_IP_HEADER` | not set | The request header the dashboard trusts for the visitor address (section 4). |
| `LAVALINK_HEAP` | `1G` | The memory limit of Lavalink. Use `512m` on a small machine. |
| `POSTGRES_USER` | `ririko` | The database user. |
| `POSTGRES_DB` | `ririko` | The database name. |
| `RIRIKO_ENV_FILE` | `.env.production` | The settings file the bot and the dashboard read. |
| `BOT_OWNER_ID` | not set | Discord user IDs of the owners, separated by commas. |
| `DEFAULT_PREFIX` | `!` | The default prefix for text commands. |

Optional features use more settings: AI chat (`DEFAULT_AI_PROVIDER`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_BASE_URL`), image generation (`REPLICATE_API_TOKEN`, `COMFYUI_URL`), stream alerts (`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `YOUTUBE_API_KEY`) and Spotify (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_SP_DC`). Leave a setting out to turn its feature off.

Compose refuses to start if `POSTGRES_PASSWORD` or `LAVALINK_PASSWORD` is empty.

---

## 8. Use a Lavalink Server on Another Machine

The default stack runs its own Lavalink. Use this section only if Lavalink runs on a different machine.

1. Make sure Docker Compose is version 2.24.4 or newer:

   ```bash
   docker compose version
   ```

2. In `.env.production`, set `LAVALINK_HOST` to the address of the Lavalink machine. Set `LAVALINK_PORT` if it is not `2333`. Set `LAVALINK_PASSWORD` to the password of that Lavalink server.
3. Start the stack with the extra file `docker-compose.remote-lavalink.yml`:

   ```bash
   docker compose -f docker-compose.production.yml -f docker-compose.remote-lavalink.yml --env-file .env.production up -d
   ```

The extra file does not start the bundled `lavalink` service or its `lavalink-plugins` helper. The bot waits for PostgreSQL only.

The bot connects to the Lavalink server with a plain WebSocket, so keep the link private, for example with WireGuard. If the server is not reachable, the bot uses its built-in FFmpeg player instead.

### 8.1. Run Lavalink on its own machine

The file `deploy/lavalink/docker-compose.yml` runs one Lavalink container for each environment: `lavalink-production` on port `2333` and `lavalink-staging` on port `2334`. Both containers use the same Lavalink image as `docker-compose.production.yml`. A test keeps the two image tags equal.

1. Copy `deploy/lavalink/lavalink.env.example` to one file for each environment you run, for example `/opt/ririko/lavalink-production.env`. Use a different `LAVALINK_PASSWORD` in each file. Keep each file readable by `root` only.
2. Set the paths of the files in `LAVALINK_PRODUCTION_ENV_FILE` and `LAVALINK_STAGING_ENV_FILE`. The defaults are `/opt/ririko/lavalink-production.env` and `/opt/ririko/lavalink-staging.env`.
3. Go into the folder of the repository checkout that holds the file. The compose file reads `../../docker/lavalink/application.yml`, so keep the repository layout.

   ```bash
   cd deploy/lavalink
   ```

4. Start the containers. Replace `10.77.0.1` with the private address that Lavalink must listen on:

   ```bash
   WG_ADDRESS=10.77.0.1 docker compose up -d
   ```

   To start one environment only, add its name, for example `lavalink-staging`.

Each container listens on `WG_ADDRESS` only. It uses host networking, so the firewall of the machine sees every client. `LAVALINK_PRODUCTION_HEAP` (default `1536m`) and `LAVALINK_STAGING_HEAP` (default `512m`) set the memory limits.

Each environment has its own plugin volume, `lavalink_production_plugins` or `lavalink_staging_plugins`. The Lavalink image runs as uid/gid 322 and has no plugins folder. Docker would create the volume owned by root, and Lavalink could not write its plugins. A one-shot service, `lavalink-production-plugins` or `lavalink-staging-plugins`, changes the owner first. The Lavalink service waits for it with `service_completed_successfully`. These services show `Exited (0)` in `docker compose ps -a`. This is normal.

### 8.2. Change the Lavalink settings

Lavalink reads its env file only when the container is created. A deploy that does not change the compose file or `application.yml` leaves the container as it is. After you change an env file, recreate the container yourself:

1. Edit the env file, for example `/opt/ririko/lavalink-staging.env`.
2. Recreate the container. This stops all players on that environment for a moment:

   ```bash
   WG_ADDRESS=10.77.0.1 docker compose up -d --force-recreate lavalink-staging
   ```

   Run it in the folder `deploy/lavalink`.

   A host that the maintainers set up with `bootstrap.sh` needs more. Run the command in `/opt/ririko/releases/<version>/deploy/lavalink`, where `<version>` is the release that runs now. Add the option `-p ririko-lavalink` to `docker compose`. Also set `LAVALINK_STAGING_ENV_FILE` (or `LAVALINK_PRODUCTION_ENV_FILE`) and the heap variables that `/etc/ririko/ririko.conf` sets.

3. Check the log of the container for errors:

   ```bash
   docker logs --tail 50 ririko-lavalink-lavalink-staging-1
   ```

For YouTube playback, the Lavalink YouTube plugin can use a separate cipher server. Add the two variables from `lavalink.env.example` to the env file, then recreate the container.

---

## 9. Containers and Volumes

### 9.1. The images

One `Dockerfile` builds both images, `bot-runner` and `web-runner`.

| Stage | Purpose |
| --- | --- |
| `base` | `node:22-bookworm-slim` with pnpm, set up through corepack. |
| `manifests` | The `package.json` files, the lock file and the workspace files. A new workspace package must be added to its `COPY` list. |
| `build` | A full install, then `pnpm build`. |
| `web-build` | `build` plus the production build of the dashboard. |
| `bot-deps`, `web-deps` | The production dependencies of the bot (with the CLI) and of the dashboard. |
| `runtime` | `node:22-bookworm-slim` with `tini`, `fonts-dejavu-core` and `ca-certificates`, and the user `ririko` (uid and gid 10001). It has no pnpm and no compilers. |
| `bot-runner` | `runtime` plus FFmpeg, the bot, the CLI and `assets/`. It runs `node apps/bot/dist/main.js`. |
| `web-runner` | `runtime` plus the dashboard build and `assets/tcg`. It runs `next start` on port 3000. |

- The build needs BuildKit. Docker Engine 23 and newer use it by default.
- The images need no compilers. `better-sqlite3` and `@napi-rs/canvas` ship prebuilt binaries.
- The images keep the repository layout at `/app`.
- `tini` is process 1. It passes `SIGTERM` to Node, so the bot disconnects from Discord cleanly. It also removes finished FFmpeg processes.
- The images read their settings from environment variables only. The build never copies a `.env` file into them.

To build the images yourself, run these commands in the repository folder:

```bash
docker build --target bot-runner -t ririko-bot .
```

```bash
docker build --target web-runner -t ririko-web .
```

To make compose build the images instead of pulling them, run `docker compose -f docker-compose.production.yml --env-file .env.production build`.

### 9.2. The services

| Service | Image | Role |
| --- | --- | --- |
| `postgres` | `postgres:16-alpine` | The database. It is healthy when `pg_isready` answers. |
| `lavalink-plugins` | `ghcr.io/lavalink-devs/lavalink:4.2.2` | Runs once. It makes the plugin volume writable for Lavalink (uid/gid 322), then stops. |
| `lavalink` | `ghcr.io/lavalink-devs/lavalink:4.2.2` | The audio server. It uses `docker/lavalink/application.yml`. Its plugins download on the first start. |
| `bot` | `ririkoai/ririkobot:${RIRIKO_VERSION:-2}` | The Discord bot. It starts when PostgreSQL is healthy. |
| `web` | `ririkoai/ririkobot-dashboard:${RIRIKO_VERSION:-2}` | The dashboard. It uses `${DASHBOARD_BIND:-127.0.0.1}:${DASHBOARD_PORT:-3000}`. |

The `lavalink` service starts after `lavalink-plugins` ends with success (`service_completed_successfully`). In `docker compose ps -a`, `lavalink-plugins` shows `Exited (0)`. This is normal.

### 9.3. The volumes

| Volume | Mounted at | Used by |
| --- | --- | --- |
| `postgres_data` | `/var/lib/postgresql/data` | `postgres` |
| `lavalink_plugins` | `/opt/Lavalink/plugins` | `lavalink` |
| `ririko_data` | `/app/data` | `bot` and `web`: the card art in `data/tcg` |
| `card_images` | `/app/public/cards` | `bot` and `web`: the rendered cards |
| `boss_images` | `/app/public/bosses` | `bot`: the dungeon boss images |
| `welcomer_backgrounds` | `/app/storage/welcomer-backgrounds` | `bot` and `web`: the uploaded welcome backgrounds |

The images run as uid 10001. A named volume starts with that owner. If you use a folder on the machine instead of a named volume, make it writable for that user first:

```bash
sudo chown -R 10001:10001 <folder>
```

The images write only to these folders. Everything else is read-only.

### 9.4. Safety settings

The compose file sets these options. A test (`scripts/compose-production.test.ts`) checks them.

- `bot` and `web` drop all Linux capabilities (`cap_drop: [ALL]`). They run as uid 10001 and need none.
- All services use `no-new-privileges`. No process can gain rights through a setuid file.
- All services rotate their logs: the `local` driver, 5 files of 20 MB each. A service keeps at most 100 MB of logs.
- The dashboard port uses `127.0.0.1` unless you set `DASHBOARD_BIND`.
- `lavalink-plugins` runs as root with only the `CHOWN` capability and no network.

---

## 10. Hosts That Deploy Through CI

The maintainers run staging and production on managed machines behind a tunnel. Releases reach them through CircleCI. The setup of those machines is in the maintainer's private runbook, which is not in the repository. The release pipeline and its exit codes are in [release.md](release.md).
