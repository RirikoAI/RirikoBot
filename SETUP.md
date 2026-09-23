# Ririko AI 2.0.0 — Local Development Setup

This guide takes a fresh clone to a running bot with the same toolchain, database content,
TCG card pool, bosses and music stack as the maintainer's development machine.

No secrets live in the repository. You create your own Discord application and API keys and
put them in a local `.env`, which is gitignored.

---

## 1. Prerequisites

| Tool | Version used | Notes |
| --- | --- | --- |
| Node.js | 22.x LTS (22.23.2) | `engines.node >= 22`. Node 24 LTS also works. |
| pnpm | 10.8.1 | Pinned by `packageManager`. Run `corepack enable` and corepack picks the right version. |
| Java (OpenJDK) | 21 (17+ minimum) | Only needed for Lavalink (music). |
| Git | 2.4x | |
| gitleaks | 8.x | Required. The pre-commit hook refuses to commit without it. `winget install gitleaks`, `brew install gitleaks`, or `go install github.com/zricethezav/gitleaks/v8@latest`. |
| FFmpeg | any recent | Optional. Only used by the non-Lavalink fallback audio path. |

Native modules (`better-sqlite3`, `@napi-rs/canvas`) ship prebuilt binaries for Node 22 on
Windows, macOS and Linux, so no C++ toolchain is normally needed. If `pnpm install` falls back
to a source build, install the platform build tools (Visual Studio Build Tools on Windows,
`build-essential` + `python3` on Linux).

Development happens on Windows 11 with Git Bash / PowerShell. All commands below work in any
POSIX shell or PowerShell unless noted.

---

## 2. Clone and install

```bash
git clone https://github.com/RirikoAI/RirikoBot.git ririko-v2-2026
```

```bash
cd ririko-v2-2026
```

```bash
git checkout develop/2.0.0
```

```bash
corepack enable
```

```bash
pnpm install
```

`pnpm install` also runs `husky` (the `prepare` script), which installs the Git pre-commit hook.
The hook blocks staged `.env` files and runs `gitleaks` on the staged changes.

---

## 3. Create a Discord application

1. Open <https://discord.com/developers/applications> and create a new application.
2. **Bot** tab: reset and copy the token (`DISCORD_TOKEN`). Enable the **Server Members** and
   **Message Content** privileged gateway intents. Prefix commands, leveling and moderation
   need them.
3. **General Information** tab: copy the Application ID (`DISCORD_CLIENT_ID`).
4. **OAuth2 → URL Generator**: select the `bot` and `applications.commands` scopes and the
   `Administrator` permission (simplest for a private test server). Open the URL and add the
   bot to your own test server.
5. In Discord, enable Developer Mode (User Settings → Advanced). Right-click your test server
   to copy its ID (`DISCORD_DEV_GUILD_ID`), and right-click your own name to copy your user ID
   (`BOT_OWNER_ID`).

Use your own application for development. Never share a bot token; anyone with it controls
the bot.

---

## 4. Configure `.env`

```bash
cp .env.example .env
```

Fill in at minimum:

| Variable | Value |
| --- | --- |
| `DISCORD_TOKEN` | Bot token from step 3 |
| `DISCORD_CLIENT_ID` | Application ID from step 3 |
| `DISCORD_DEV_GUILD_ID` | Your test server ID |
| `BOT_OWNER_ID` | Your Discord user ID |
| `SYNC_COMMANDS` | `true` for the first run (see step 8) |

Keep these defaults for the standard local setup:

```env
DATABASE_DIALECT=sqlite
DATABASE_URL=./data/ririko.sqlite
DEFAULT_PREFIX=!
LAVALINK_HOST=127.0.0.1
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
```

Optional integrations. Leave blank to disable the feature:

| Feature | Variables | Where to get them |
| --- | --- | --- |
| AI chat (`#ririko-ai`) | `DEFAULT_AI_PROVIDER`, `GEMINI_API_KEY` or `OPENAI_API_KEY` (+ `OPENAI_BASE_URL`), `OLLAMA_BASE_URL` | <https://aistudio.google.com/>, OpenAI/OpenRouter dashboard, or a local Ollama. `pnpm ai:configure` edits these interactively. |
| Spotify search / playback | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`, `SPOTIFY_DC`, `SPOTIFY_KEY`, `SPOTIFY_SP_DC` | <https://developer.spotify.com/dashboard>; `sp_dc` / `sp_key` cookies from open.spotify.com DevTools |
| YouTube reliability | `YOUTUBE_COOKIE`, `YOUTUBE_PO_TOKEN`, `YOUTUBE_VISITOR_DATA` | Browser cookies; `pnpm cli youtube:token` helps generate a PO token |
| Stream alerts | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `YOUTUBE_API_KEY`, `TIKTOK_SESSION_ID`, `TIKTOK_API_KEY` | <https://dev.twitch.tv/console/apps>, Google Cloud console |
| Credential vault | `SECRET_VAULT_KEY` | `openssl rand -hex 32` (64 hex characters) |

Check the result:

```bash
pnpm doctor
```

---

## 5. Build the database

The dev database is SQLite at `data/ririko.sqlite` (gitignored). This command deletes any
existing file, applies the schema, and seeds the shop catalog, achievements, game items and
equipment, dungeon seasons and the canonical waifu assets:

```bash
pnpm db:reset
```

It needs internet access (waifu.im). Run it again at any time to start from a clean database.
It deletes all local data, including player progress.

The bot also creates the schema on its own when it starts against an empty file, but it does
not seed the TCG content. Always run `db:reset` on a fresh clone.

---

## 6. Restore the TCG card pool and bosses

The card and boss definitions are committed under `assets/tcg/catalog/`. The rendered images
(`public/cards/`, `public/bosses/`) and the downloaded artwork cache (`data/tcg/`) are
gitignored, so rebuild them and write the rows into your database:

```bash
pnpm tcg:card-builder --rerender
```

```bash
pnpm tcg:boss-builder --all
```

- `--rerender` re-renders every card in `assets/tcg/catalog/manifest.json` and upserts it into
  `waifu_cards` with the same IDs, stats, skills and collection numbers.
- `--all` syncs, renders and imports every boss catalog in `assets/tcg/catalog/bosses/`.

Both commands download artwork from AniList and Danbooru with rate limiting. The first run
takes a while; later runs use the cache in `data/tcg/`. Both commands are resumable.

---

## 7. Set up Lavalink (music)

Lavalink 4.2.2 is a separate Java server in `lavalink/` (gitignored).

```bash
pnpm lavalink:install
```

This checks Java, downloads `Lavalink.jar`, and writes `lavalink/application.yml` from your
`.env` (`LAVALINK_PORT`, `LAVALINK_PASSWORD`, Spotify values). The plugins (LavaSrc,
LavaSearch, YouTube, LavaLyrics, Skybot, LavaDSPX) are pinned in that file, and Lavalink
downloads them on the first start.

Start it in its own terminal and leave it running:

```bash
pnpm lavalink:start
```

Wait for `Lavalink is ready to accept connections`. If you change `LAVALINK_PASSWORD` or the
Spotify values, run `pnpm lavalink:install` again so both sides match.

To run the bot without music, set `LAVALINK_ENABLED=false`.

---

## 8. Run the bot

```bash
pnpm dev:bot
```

This runs `apps/bot/src/main.ts` with `tsx watch` and loads the root `.env`. It restarts when
you save a file.

With `SYNC_COMMANDS=true` and `DISCORD_DEV_GUILD_ID` set, slash commands register to your test
server at startup and show up immediately. After the first successful sync, set
`SYNC_COMMANDS=false` to skip the REST call on every restart. Turn it on again when you add or
change a slash command. Without `DISCORD_DEV_GUILD_ID`, the sync registers global commands,
which can take up to an hour to appear.

Smoke test in your server: `/help`, `$help`, `/ping`, and `/play <song>` while you are in a
voice channel.

Production-style run (compiled output):

```bash
pnpm build
```

```bash
pnpm start:bot
```

---

## 9. Quality gates

Run these before every commit. The pre-commit hook only scans for secrets, so it does not run them for you.

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm format:check
```

```bash
pnpm test
```

---

## 10. Daily workflow summary

Terminal 1:

```bash
pnpm lavalink:start
```

Terminal 2:

```bash
pnpm dev:bot
```

---

## 11. Useful scripts

| Script | Purpose |
| --- | --- |
| `pnpm doctor` | Check Node, TypeScript, database, Discord credentials, FFmpeg and optional integrations |
| `pnpm ai:configure` | Interactive AI provider setup (edits `.env`) |
| `pnpm cli <command>` | Ririko CLI (`doctor`, `ai:configure`, `youtube:token`, `migrate:legacy`, `migrate:verify`, ...) |
| `pnpm db:reset` | Wipe and reseed the dev database |
| `pnpm tcg:card-builder --help` | Card catalog sync, generation, re-render and import |
| `pnpm tcg:boss-builder --help` | Boss catalog sync, render and import |
| `pnpm tcg:reset-user <discord_user_id>` | Reset one player's TCG progress |
| `pnpm tcg:simulate` | Offline balance simulation |
| `pnpm tcg:generate-assets` | Regenerate frame, foil, star and element assets |

---

## 12. Migrating a 1.4.0 database (optional)

To import data from a legacy RirikoBot 1.4.0 SQLite file, follow
[docs/migrations.md](docs/migrations.md) and [docs/migration-1.x-to-2.0.md](docs/migration-1.x-to-2.0.md).
Always back up `data/ririko.sqlite` first.

---

## 13. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Used disallowed intents` at login | Enable the privileged intents in the Developer Portal (step 3). |
| Slash commands missing | Set `SYNC_COMMANDS=true` and `DISCORD_DEV_GUILD_ID`, then restart the bot. |
| Prefix commands ignored | Message Content intent is off, or you are using the wrong prefix (`DEFAULT_PREFIX`). |
| Music does not play, Lavalink auth error | `LAVALINK_PASSWORD` in `.env` differs from `lavalink/application.yml`. Run `pnpm lavalink:install` again. |
| `Java 17+ is required` | Install OpenJDK 21 and make sure `java` is on `PATH`. |
| `better-sqlite3` / canvas binary errors after a Node upgrade | Run `pnpm rebuild` or delete `node_modules` and run `pnpm install` again. |
| TCG cards show without art | Run `pnpm tcg:card-builder --rerender` again. The bot renders missing cards on demand, but it needs the artwork cache. |
| `database is locked` | Stop all running bot processes and scripts that use `data/ririko.sqlite`. |

---

## 14. Keep secrets out of Git

- `.env`, `data/`, `lavalink/`, `.cache/`, `.local/`, `*.sqlite` and `*.pem` are gitignored.
  Do not force-add them.
- The pre-commit hook rejects staged `.env` files and runs `gitleaks` with the rules in
  `.gitleaks.toml`. Do not bypass it with `--no-verify`.
- If a token leaks, reset it at the provider immediately. Deleting the commit is not enough.

Next: read [README.md](README.md), [docs/development.md](docs/development.md) and
[docs/contributing.md](docs/contributing.md).
