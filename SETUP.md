# Set Up Ririko From Source

This guide takes you from a fresh download to a running Ririko bot on your own computer, without Docker. Use it to try Ririko, to run it on a server with Node.js, or to work on the code. If you prefer Docker, read [docs/deployment.md](docs/deployment.md) instead.

No secrets are stored in the repository. You create your own Discord application and your own keys. You put them in a local `.env` file, which Git ignores.

---

## 1. Prerequisites

Install these tools first:

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 22 LTS or newer | Node.js 24 LTS also works. |
| pnpm | 10.8.1 | Run `corepack enable` and corepack picks this version for you. |
| Git | 2.4 or newer | |
| Java (OpenJDK) | 21 (17 is the minimum) | Only for Lavalink, the music server. |
| gitleaks | 8.x | Only for developers. The Git pre-commit hook refuses to commit without it. Install it with `winget install gitleaks`, `brew install gitleaks`, or `go install github.com/zricethezav/gitleaks/v8@latest`. |
| FFmpeg | any recent version | Optional. Only the fallback audio player uses it. |

The native modules (`better-sqlite3` and `@napi-rs/canvas`) come with ready-made files for Windows, macOS and Linux. You normally need no C++ tools. If `pnpm install` has to build a module from source, install the build tools of your system first: Visual Studio Build Tools on Windows, or `build-essential` and `python3` on Linux.

All commands in this guide work in a POSIX shell (Bash, zsh) and in PowerShell.

---

## 2. Download and Install

1. Download the repository:

   ```bash
   git clone https://github.com/RirikoAI/RirikoBot.git
   ```

2. Go into the folder:

   ```bash
   cd RirikoBot
   ```

3. Turn on corepack:

   ```bash
   corepack enable
   ```

4. Install the packages:

   ```bash
   pnpm install
   ```

   The command ends without errors. It also runs `husky`, which sets up the Git pre-commit hook. The hook blocks staged `.env` files and runs `gitleaks` on the staged changes.

---

## 3. Create a Discord Application

1. Open <https://discord.com/developers/applications> and click **New Application**.
2. Open the **Bot** tab. Click **Reset Token** and copy the token. This is your `DISCORD_TOKEN`.
3. On the same tab, turn on **Server Members Intent** and **Message Content Intent**. Click **Save Changes**. Prefix commands, levels and moderation need them.
4. Open the **General Information** tab. Copy the **Application ID**. This is your `DISCORD_CLIENT_ID`.
5. Open **OAuth2**, then **URL Generator**. Select the scopes `bot` and `applications.commands`. Select the permission `Administrator`. This is the simplest choice for a private test server.
6. Open the generated URL and add the bot to your own server.
7. In Discord, turn on Developer Mode (**User Settings**, **Advanced**). Right-click your server and click **Copy Server ID**. This is your `DISCORD_DEV_GUILD_ID`. Right-click your own name and click **Copy User ID**. This is your `BOT_OWNER_ID`.

Never share the bot token. Anyone who has it controls your bot.

---

## 4. Write the `.env` File

1. Copy the example file:

   ```bash
   cp .env.example .env
   ```

2. Open `.env` in a text editor and set at least these values:

   | Variable | Value |
   | --- | --- |
   | `DISCORD_TOKEN` | The bot token from step 3. |
   | `DISCORD_CLIENT_ID` | The application ID from step 3. |
   | `DISCORD_DEV_GUILD_ID` | The ID of your test server. |
   | `BOT_OWNER_ID` | Your Discord user ID. Separate several owners with commas. An owner can open the owner console of the dashboard after they add a passkey. |
   | `SYNC_COMMANDS` | `true` for the first run (step 8). |

3. Keep these default values for a standard local setup:

   ```env
   DATABASE_DIALECT=sqlite
   DATABASE_URL=./data/ririko.sqlite
   DEFAULT_PREFIX=!
   LAVALINK_HOST=127.0.0.1
   LAVALINK_PORT=2333
   LAVALINK_PASSWORD=youshallnotpass
   ```

   Change `LAVALINK_PASSWORD` if the computer is reachable from other computers.

4. Optional: set the values for the features you want. If you leave a value empty, the feature is off.

   | Feature | Variables | Where to get them |
   | --- | --- | --- |
   | AI chat (`#ririko-ai`) | `DEFAULT_AI_PROVIDER`, and `GEMINI_API_KEY`, or `OPENAI_API_KEY` (with `OPENAI_BASE_URL`), or `OLLAMA_BASE_URL` | <https://aistudio.google.com/>, the dashboard of OpenAI or OpenRouter, or a local Ollama. The command `pnpm ai:configure` edits these values for you. |
   | Spotify search and playback | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`, `SPOTIFY_DC`, `SPOTIFY_KEY`, `SPOTIFY_SP_DC` | <https://developer.spotify.com/dashboard>. The `sp_dc` and `sp_key` cookies come from the developer tools of your browser on open.spotify.com. |
   | Stream alerts | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `YOUTUBE_API_KEY`, `TIKTOK_SESSION_ID`, `TIKTOK_API_KEY` | <https://dev.twitch.tv/console/apps> and the Google Cloud console. |
   | Credential vault | `SECRET_VAULT_KEY` | Run `openssl rand -hex 32`. The result has 64 characters. |
   | Web dashboard | `DISCORD_CLIENT_SECRET`, `DASHBOARD_URL`, `SECRET_VAULT_KEY` | The client secret is on the **OAuth2** page of the Developer Portal. See [section 8.1](#81-run-the-web-dashboard). |

5. Check your settings:

   ```bash
   pnpm doctor
   ```

   Each required check shows a green mark. A warning for an optional integration is normal.

---

## 5. Build the Database

The database is a SQLite file, `data/ririko.sqlite`. Git ignores it. The next command deletes any existing file and builds the schema. Then it adds the default data: the shop catalog, the achievements, the game items and equipment, the dungeon seasons and the standard waifu assets.

This command deletes all local data, including the progress of players. Do not run it on a database that you want to keep.

1. Build the database:

   ```bash
   pnpm db:reset
   ```

   The command needs internet access (waifu.im). It ends without errors.

You can run it again at any time to start from a clean database.

The bot also builds the schema by itself when it starts on an empty file. But it does not add the Waifu TCG content. So always run `pnpm db:reset` on a new download.

---

## 6. Restore the TCG Card Pool and Bosses

The definitions of the cards and bosses are in `assets/tcg/catalog/`. The rendered images (`public/cards/` and `public/bosses/`) and the artwork cache (`data/tcg/`) are not in Git. You build them, and write the rows into your database.

1. Render the cards:

   ```bash
   pnpm tcg:card-builder --rerender
   ```

   The command renders every card in `assets/tcg/catalog/manifest.json` and writes it to `waifu_cards` with the same ids, stats, skills and collection numbers.

2. Render the bosses:

   ```bash
   pnpm tcg:boss-builder --all
   ```

   The command syncs, renders and imports every boss catalog in `assets/tcg/catalog/bosses/`.

Both commands download artwork from AniList and Danbooru, and they keep to the rate limits. The first run takes a long time. Later runs use the cache in `data/tcg/`. You can stop and start both commands again.

---

## 7. Set Up Lavalink (Music)

Lavalink 4.2.2 is a separate Java program. It lives in the folder `lavalink/`, which Git ignores. If you do not want music, set `LAVALINK_ENABLED=false` in `.env` and go to step 8.

1. Install Lavalink:

   ```bash
   pnpm lavalink:install
   ```

   The command checks Java, downloads `Lavalink.jar`, and writes `lavalink/application.yml` from your `.env` (`LAVALINK_PORT`, `LAVALINK_PASSWORD` and the Spotify values). The plugins (LavaSrc, LavaSearch, YouTube, LavaLyrics, Skybot and LavaDSPX) are fixed in that file. Lavalink downloads them on the first start.

2. Open a new terminal window. Start Lavalink there and leave it running:

   ```bash
   pnpm lavalink:start
   ```

   Wait for the line `Lavalink is ready to accept connections`.

If you change `LAVALINK_PASSWORD` or the Spotify values, run `pnpm lavalink:install` again, so the bot and Lavalink use the same values.

Optional: to use a separate cipher server for YouTube, set `LAVALINK_YOUTUBE_CIPHER_URL` in `.env` and run `pnpm lavalink:install` again.

---

## 8. Run the Bot

1. Start the bot:

   ```bash
   pnpm dev:bot
   ```

   This runs `apps/bot/src/main.ts` with `tsx watch`, and loads the `.env` file in the root folder. The bot restarts when you save a file. You see `Logged in as` and the name of your bot.

2. In your server, send `/ping`. The bot answers.

Discord allows 100 slash commands in each scope. So Ririko registers its commands in two scopes:

- **Global.** Member commands (`/play`, `/balance`, `/card` and others) and the Translate message menu. Global changes can take a while to show. Press Ctrl+R in Discord.
- **Per server.** Admin and setup commands (`/ban`, `/prefix`, `/welcomer` and others). They show at once. The bot registers them by itself in each server it joins.

With `SYNC_COMMANDS=true`, the bot registers both scopes when it starts. The per-server commands go to `DISCORD_DEV_GUILD_ID` when it is set. Otherwise they go to every server the bot is in. After the first good run, set `SYNC_COMMANDS=false`, so the bot does not call Discord on every restart.

When you add or change a command, you can register it without a restart:

1. Check how many command slots are used. This writes nothing:

   ```bash
   pnpm cli commands:sync
   ```

2. Register the global commands and the per-server commands of one server. Replace `<server_id>` with the ID of the server:

   ```bash
   pnpm cli commands:sync --global --guild <server_id>
   ```

   Use `--all-guilds` in place of `--guild <server_id>` for every server the bot is in.

To remove old commands that an older bot version registered:

1. List every registered command:

   ```bash
   pnpm cli commands:reset
   ```

2. Remove them:

   ```bash
   pnpm cli commands:reset --yes
   ```

3. Register the current commands again:

   ```bash
   pnpm cli commands:sync --global --all-guilds
   ```

To test your bot, send `/help`, `$help` and `/ping` in your server. Join a voice channel and send `/play <song>`.

To run the compiled code, as you would on a server:

1. Build the project:

   ```bash
   pnpm build
   ```

2. Start the bot:

   ```bash
   pnpm start:bot
   ```

### 8.1. Run the web dashboard

The dashboard (`apps/web`) lets users sign in with Discord OAuth2. It reads the same `.env` file as the bot. It needs three more values:

1. In the Developer Portal, open your application and open **OAuth2**. Copy the **Client Secret** into `DISCORD_CLIENT_SECRET`. Under **Redirects**, add `http://localhost:3000/api/auth/callback`.
2. Set `DASHBOARD_URL=http://localhost:3000`. For a public dashboard, use your public `https://` address. Then add `<DASHBOARD_URL>/api/auth/callback` as a redirect.
3. Set `SECRET_VAULT_KEY` to the output of `openssl rand -hex 32`. The dashboard uses it to encrypt the Discord tokens of each session. If you change it, everyone is signed out.

The dashboard keeps sessions in the table `web_sessions`. The bot creates the table when it migrates the database. Start the bot at least once before the dashboard.

4. Start the dashboard:

   ```bash
   pnpm dev:web
   ```

5. Open <http://localhost:3000> in Chrome or Firefox. Click **Sign in with Discord**.

The session cookie uses the `__Host-` prefix. Browsers accept it only on HTTPS or on `localhost`. Do not open the dashboard through a LAN address over plain HTTP.

To run the compiled dashboard:

1. Build it:

   ```bash
   pnpm build:web
   ```

2. Start it:

   ```bash
   pnpm start:web
   ```

---

## 9. Quality Gates

Developers run these checks before every commit. The pre-commit hook only scans for secrets. It does not run the checks.

1. Check the types:

   ```bash
   pnpm typecheck
   ```

2. Check the code style:

   ```bash
   pnpm lint
   ```

3. Check the formatting:

   ```bash
   pnpm format:check
   ```

4. Run the tests:

   ```bash
   pnpm test
   ```

[docs/development.md](docs/development.md) and [docs/testing.md](docs/testing.md) have more.

---

## 10. Daily Workflow

1. In terminal 1, start Lavalink:

   ```bash
   pnpm lavalink:start
   ```

2. In terminal 2, start the bot:

   ```bash
   pnpm dev:bot
   ```

---

## 11. Useful Scripts

| Script | Purpose |
| --- | --- |
| `pnpm doctor` | Checks Node.js, TypeScript, the database, the Discord credentials, FFmpeg and the optional integrations. |
| `pnpm ai:configure` | Sets up the AI providers. It edits `.env`. |
| `pnpm cli <command>` | Runs the Ririko command-line tool. [docs/development.md](docs/development.md#4-the-ririko-command-line-tool) lists the commands. |
| `pnpm db:reset` | Deletes the development database and builds it again. |
| `pnpm tcg:card-builder --help` | Shows the options of the card catalog builder. |
| `pnpm tcg:boss-builder --help` | Shows the options of the boss catalog builder. |
| `pnpm tcg:reset-user <discord_user_id>` | Resets the TCG progress of one player. |
| `pnpm tcg:simulate` | Runs the offline balance simulation. |
| `pnpm tcg:generate-assets` | Builds the frame, foil, star and element images again. |

---

## 12. Move a 1.4.0 Database (Optional)

To import the data of a Ririko 1.4.0 SQLite file, follow [docs/migrations.md](docs/migrations.md). Back up `data/ririko.sqlite` first.

---

## 13. Troubleshooting

| What you see | What to do |
| --- | --- |
| `Used disallowed intents` at login | Turn on the privileged intents in the Developer Portal (step 3). |
| Slash commands are missing | Run `pnpm cli commands:sync --global --guild <server_id>`, then press Ctrl+R in Discord. |
| Prefix commands do nothing | The Message Content intent is off, or you use the wrong prefix. Check `DEFAULT_PREFIX`. |
| Music does not play, or Lavalink says the password is wrong | `LAVALINK_PASSWORD` in `.env` is not the same as in `lavalink/application.yml`. Run `pnpm lavalink:install` again. |
| `Java 17+ is required` | Install OpenJDK 21 and check that `java` is in your `PATH`. |
| Errors from `better-sqlite3` or the canvas module after a Node.js upgrade | Run `pnpm rebuild`. Or delete the folder `node_modules` and run `pnpm install` again. |
| TCG cards show without art | Run `pnpm tcg:card-builder --rerender` again. The bot renders missing cards when it needs them, but it needs the artwork cache. |
| `database is locked` | Stop all bot processes and scripts that use `data/ririko.sqlite`. |

---

## 14. Keep Secrets Out of Git

- Git ignores `.env`, `data/`, `lavalink/`, `.cache/`, `.local/`, `*.sqlite` and `*.pem`. Never force-add them.
- The pre-commit hook rejects staged `.env` files and runs `gitleaks` with the rules in `.gitleaks.toml`. Never skip it with `--no-verify`.
- If a token leaks, reset it at its provider at once. Deleting the commit is not enough.

Next, read [README.md](README.md), [docs/development.md](docs/development.md) and [docs/contributing.md](docs/contributing.md).
