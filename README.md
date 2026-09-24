# Ririko AI 2.0.0

Ririko is a multipurpose Discord bot: music, AI chat, moderation, economy, leveling,
giveaways, auto-voice channels, stream alerts, mini-games and the Waifu TCG (cards, gear,
dungeons and seasonal bosses).

Version 2.0.0 is a full rewrite of RirikoBot 1.4.0 as a TypeScript monorepo. It keeps
feature and command parity with 1.4.0, with slash and prefix versions of every command.

> Active development happens on the `develop/2.0.0` branch. Feature branches
> (`feat/<ticket-id>-<slug>`) target `develop/2.0.0`.

## Getting started

Follow **[SETUP.md](SETUP.md)**. It takes a fresh clone to a running bot with the same database
content, TCG card pool, bosses and Lavalink music stack as the maintainer's machine.

Short version, after you fill in `.env`:

```bash
pnpm install
```

```bash
pnpm db:reset
```

```bash
pnpm tcg:card-builder --rerender
```

```bash
pnpm tcg:boss-builder --all
```

```bash
pnpm lavalink:start
```

```bash
pnpm dev:bot
```

Run `pnpm lavalink:start` and `pnpm dev:bot` in separate terminals.

## Tech stack

- Node.js 22 LTS, TypeScript (strict), ESM, pnpm 10 workspaces
- Discord.js 14 (REST and Gateway v10)
- Drizzle ORM: SQLite in development, PostgreSQL in production
- Lavalink 4 for music (YouTube, Spotify, SoundCloud, Deezer and more via plugins)
- Multi-provider AI: Google Gemini, OpenAI-compatible APIs, Ollama
- `@napi-rs/canvas` for rank cards, memes and TCG card rendering
- Vitest, ESLint, Prettier, Husky + gitleaks

## Repository layout

```text
apps/
  bot/          Discord bot entry point (src/main.ts) and command modules
  cli/          Ririko CLI: doctor, ai:configure, youtube:token, legacy migration
packages/
  core/         Config schema, logging, shared utilities
  database/     Drizzle schemas (SQLite and PostgreSQL), repositories, DB client
  discord/      Client factory, command router, middleware, help center
  services/     Domain services (economy, leveling, TCG, streams, ...)
  music/        Music player, queue and Lavalink integration
  ai/           AI provider adapters and tool calling
assets/tcg/     TCG catalogs (cards, bosses) and static art (frames, foils, stars, elements)
scripts/        Database reset, Lavalink setup, TCG builders and simulators
docs/           Architecture, feature specs, ADRs and the Kanban board
```

Generated or local-only paths (gitignored): `.env`, `data/` (SQLite DB and artwork cache),
`lavalink/`, `public/cards/`, `public/bosses/`, `.local/`.

## Common scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev:bot` | Run the bot with hot reload |
| `pnpm build` / `pnpm start:bot` | Compile and run the production build |
| `pnpm dev:web` | Run the web dashboard (see [SETUP.md](SETUP.md#81-run-the-web-dashboard)) |
| `pnpm doctor` | Check the environment and integrations |
| `pnpm db:reset` | Wipe and reseed the dev database |
| `pnpm lavalink:install` / `pnpm lavalink:start` | Set up and run the Lavalink server |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Quality gates |

See [SETUP.md](SETUP.md#11-useful-scripts) for the full list.

## Documentation

- [SETUP.md](SETUP.md): local development setup
- [docs/architecture.md](docs/architecture.md): monorepo topology, command router, database, audio
- [docs/development.md](docs/development.md): developer tooling and engineering rules
- [docs/contributing.md](docs/contributing.md): PR standards and conventional commits
- [docs/testing.md](docs/testing.md): testing standards and quality gates
- [docs/commands.md](docs/commands.md), [docs/modules.md](docs/modules.md): commands and modules
- [docs/music.md](docs/music.md), [docs/ai.md](docs/ai.md), [docs/economy.md](docs/economy.md),
  [docs/moderation.md](docs/moderation.md): feature docs
- [docs/waifu-tcg.md](docs/waifu-tcg.md), [docs/tcg-player-guide.md](docs/tcg-player-guide.md):
  Waifu TCG design and player guide
- [docs/deployment.md](docs/deployment.md): production deployment
- [docs/migrations.md](docs/migrations.md): migrating from 1.4.0
- [docs/kanban/protocol.md](docs/kanban/protocol.md): Kanban workflow (WIP limit 1)
- [BLUEPRINT.md](BLUEPRINT.md): full 2.0.0 blueprint

## Security

Never commit `.env`, tokens, cookies or database files. The pre-commit hook blocks `.env` files
and runs gitleaks on every commit. Report vulnerabilities privately to the maintainers, not in
public issues.

## License

[MIT](LICENSE)
