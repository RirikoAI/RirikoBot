# Ririko AI 2.0.0

A modular redevelopment of Ririko 1.4.0. **Current status: audited source and working foundation; full feature parity and the 2.0 release remain in progress.**

The bot currently exposes `/ping`, `/prefix`, `/help` and matching prefix commands, including `setprefix`. It has shared settings/permissions, persistent SQLite/PostgreSQL configuration, dynamic help, operator tooling, health probes and automated tests. Music, AI, economy, TCG, dashboard and the rest of the legacy command set are not registered yet.

## Start locally
Use Node 24 LTS and pnpm 10.34.5. Exact choices and compatibility evidence are in [dependency evaluation](docs/dependency-evaluation.md).

```sh
pnpm install --frozen-lockfile
# Copy .env.example to .env and configure credentials for gateway use.
pnpm ririko migrate
pnpm ririko doctor
pnpm ririko command:list
# Set DISCORD_GUILD_ID for an isolated development server first:
pnpm ririko command:sync
pnpm dev
```

Migrations create the new foundation schema only. They refuse an existing legacy database. Do not point the new runtime at production 1.4.0 data. The [legacy migration runbook](docs/migration-1.x-to-2.0.md) describes staging, preservation and release gates.

## Engineering
[Work board](.workboard/BOARD.md) · [Standing work protocol](.workboard/PROTOCOL.md) · [Workflow commands](docs/work-management.md). Every session and sub-agent follows the same single-ticket execution limit, estimated grooming and user PR checkpoints. Run `pnpm board install-hooks` once per clone and `pnpm board check` before work.

[Architecture](docs/architecture.md) · [Source inventory](docs/legacy-feature-inventory.md) · [Roadmap](docs/implementation-roadmap.md) · [Development](docs/development.md) · [Commands](docs/commands.md) · [Testing](docs/testing.md) · [Deployment](docs/deployment.md)

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

PostgreSQL integration tests use `TEST_POSTGRES_URL` pointing at a disposable test database; they create isolated schemas. CI supplies a PostgreSQL service. Browser E2E will be added with the dashboard; current E2E exercises real CLI subprocesses and persistent state.

Audited legacy source: [RirikoAI/RirikoBot](https://github.com/RirikoAI/RirikoBot) at `0d8be25b17e25dfa61812d6e7b5aaf8497687257`. `.audit/RirikoBot` and `.local/` are immutable references. [MIT license](LICENSE).

