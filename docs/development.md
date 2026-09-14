# Development and operator commands

This guide separates the working foundation from future extension work. Only `generate command`, core settings and the `ping`, `prefix` and `help` command families are implemented. Music, AI, games, the dashboard and the legacy importer remain planned. A future-extension walkthrough is a design procedure, not an available command.

Before editing, read [work management](work-management.md), the active ticket/handoff, [architecture](architecture.md), the matching specialist instructions and relevant [blueprint](../BLUEPRINT.md) sections. Run `pnpm board check`. All sessions and workers share one active ticket. Install hooks in each clone with `pnpm board install-hooks`; never silently replace custom hooks.

## Reproducible setup

Run from the repository root. [package.json](../package.json) requires Node **>=24.13.1 <25**, pnpm **10.34.5** and TypeScript **6.0.3**. [dependency-evaluation.md](dependency-evaluation.md) records the decisions. Generic Node 22 or latest pnpm is not this project's tested baseline.

```sh
node --version
pnpm --version
git status --short --branch
git remote -v
git worktree list
```

Verify the topic and active board first. A fresh clone should use the coordinator-selected topic; `develop/2.0.0-astra` is the integration branch, while `develop/2.0.0` is a separate comparison branch. Do not switch a dirty checkout to follow a setup example.

Use an explicitly pinned package manager. If Corepack is already available, `corepack pnpm --version` should resolve the repository pin. Consult the [official installation guide](https://pnpm.io/installation) when provisioning a host. Stop on a version mismatch or a prompt to recreate `node_modules`; do not accept an implicit reinstall from an unrelated global shim.

```sh
pnpm install --frozen-lockfile
pnpm board install-hooks
pnpm board check
pnpm board requirements-check
pnpm ririko version
pnpm ririko help
```

A frozen-lockfile failure is dependency drift to investigate, not a reason to delete the lockfile. [pnpm-workspace.yaml](../pnpm-workspace.yaml) permits dependency build scripts only for `better-sqlite3` and `esbuild`. New build dependencies need a reviewed reason.

SQLite uses a native addon. If a matching binary is unavailable, provide compatible Python and platform C++ tools; Windows node-gyp instructions specify Visual Studio's Desktop development with C++ workload. Follow [node-gyp's platform instructions](https://github.com/nodejs/node-gyp#installation), retain the first compilation error and record Node/OS/architecture. Changing Node versions can require rebuilding with the pinned package manager. FFmpeg is optional for the current foundation; detecting it does not implement music playback.

### Environment and a new database

Copy `.env.example` only when `.env` does not exist. PowerShell:

```powershell
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
```

Bot and CLI load `.env` from the current working directory using Node's built-in loader. Existing process variables take precedence, so editing `.env` will not override an inherited shell value. The parser consumes known fields and reports invalid field names without their contents. See [configuration source](../packages/core/src/config.ts) and [Node's environment-file API](https://nodejs.org/api/process.html#processloadenvfilepath).

| Field | Current default / validation | Meaning |
|---|---|---|
| `NODE_ENV` | development; development/test/production | Runtime mode, not module enablement |
| `DATABASE_DIALECT` | sqlite; sqlite/postgres | Actual driver selection |
| `DATABASE_URL` | `data/ririko.db`; nonempty | SQLite path or `:memory:`; PostgreSQL URI with postgres dialect |
| `DEFAULT_PREFIX` | `!`; 1–16 characters, no whitespace/control characters | Fallback for guilds without a saved prefix |
| `DISCORD_TOKEN` | Optional nonempty string | Required for gateway and command synchronization |
| `DISCORD_APPLICATION_ID` | Optional 1–20 digit string | Required with token; shape validation is not ownership verification |
| `DISCORD_GUILD_ID` | Optional 1–20 digit string | Development registration target |
| `BOT_OWNER_IDS` | Empty; trimmed comma-separated numeric IDs | First entry labels privileged CLI settings writes |
| `LOG_LEVEL` | info; fatal/error/warn/info/debug/trace/silent | Log threshold |
| `HEALTH_HOST` / `HEALTH_PORT` | `127.0.0.1` / `3001`; port 0–65535 | Port 0 is ephemeral; select a known port for manual probes |

Use a **new, separate development database**. `migrate` creates/applies the foundation schema, not a 1.x import. It refuses foreign tables, incomplete managed schema and incompatible migration history. Never point it at a legacy database or repair history by hand.

```sh
pnpm ririko migrate
pnpm ririko migrate:status
pnpm ririko health
pnpm ririko command:list --json
pnpm ririko module:list
```

Successful foundation migration currently yields `{ "current": 1, "latest": 1 }`. `health` proves database readiness only. Read commands do not create a missing SQLite database. Separate CLI processes do not share the same `:memory:` database.

For a live development bot, configure credentials and guild, inspect `command:list`, explicitly run `pnpm ririko command:sync`, then `pnpm dev`. Synchronization performs a REST bulk replacement of that application's commands in the selected scope; it is not discovery. Default scope requires `DISCORD_GUILD_ID`; `--global` explicitly replaces global registrations. Startup never registers automatically. Synchronize only the intended application/guild.

With the bot running, `GET /health/live` checks liveness and `GET /health/ready` combines gateway/database/shutdown state. A successful CLI database check does not establish Discord login. See [deployment](deployment.md).

## Exact CLI contract

`pnpm ririko` invokes [the CLI entry point](../apps/cli/src/index.ts) and [runCli](../apps/cli/src/cli.ts); no globally installed `ririko` executable is required. Success returns **0**. Handled failures return **1**, print a safe message on stderr and close the database in `finally`. Expected `AppError` messages are public; unexpected exceptions use a generic message. Errors remain text even when a command supports JSON output.

| Invocation after `pnpm ririko` | Output / side effect | Preconditions or failure |
|---|---|---|
| `help`, `--help`, no arguments | Usage; no DB construction | Entry-point `.env` loading still occurs |
| `version`, `--version` | `2.0.0`; no DB construction | Version does not certify release completeness |
| `doctor [--json]` | Named ok/error/optional checks; no writes | Any error gives exit 1 |
| `migrate` | Explicit foundation schema changes | Refuses foreign/incomplete/tampered schema |
| `migrate:status` | JSON current/latest version | Rejects incompatible history |
| `health` | Database-ready text | Does not inspect gateway/providers |
| `command:list [--json]` | Shared registry metadata | No network registration |
| `command:sync [--global]` | Replaces selected registrations | Token/application and development guild unless global |
| `module:list` | Installed module definitions as JSON | Currently only essential core |
| `module:enable GUILD MODULE` | Persistent validated settings JSON | Local owner identity; installed module |
| `module:disable GUILD MODULE` | Same persistence path | Essential core cannot be disabled |
| `guild:config GUILD` | Validated settings/defaults JSON | Numeric guild; no remote membership lookup |
| `guild:config GUILD --prefix '?'` | Persistent prefix, revision and audit | Local owner, valid prefix; stale write fails |
| `generate command NAME` | Three generated file paths | Workspace root, valid name and new directory |

Known operational commands construct configuration and a database connection before command-specific handling. Metadata listing does not probe database health, but invalid configuration or driver initialization can still fail it. `migrate:status`, `health` and `module:list` currently ignore surplus arguments; this is not support for extra options. Other usage validation is explicit in `runCli`. Unknown commands fail instead of returning placeholder success.

### Doctor's actual limits

[Doctor](../apps/cli/src/doctor.ts) checks Node major 24, parsed configuration, token/application **presence**, storage access, database health, migration history and FFmpeg availability with a three-second process timeout. Providers appear as optional pending implementation. It does not check TypeScript installation, remotely verify Discord credentials, test models/providers or inspect an image cache. Missing Discord credentials cause exit 1 even when offline commands/tests work. Optional FFmpeg/provider results do not fail the command.

### Privileged host identity and conflicts

Settings writes create `ActorContext` using the first `BOT_OWNER_IDS` entry, the supplied guild, `ManageGuild`, and `isOwner: true`. This is a trusted-host convention, not OAuth authentication. Someone able to run the CLI with database access and a modified environment can choose that audit identity. Restrict host/config/database access. Do not expose this actor construction through a dashboard endpoint: dashboard requests need independent authentication and fresh authorization.

Migration and command sync rely on host/database or Discord credentials respectively; they do **not** require `BOT_OWNER_IDS` today. Settings writes use `SettingsService`, a fresh read, expected revision and transactional audit. A separate bot process may retain an old value for the default five-second cache TTL. On a revision conflict, reread and decide whether the intended change still applies; do not overwrite revisions or retry blindly.

## Add a command: working walkthrough

Run this only within a groomed ticket owning both generated files and registration. `status-example` is illustrative, not a request to add a feature.

1. Define acceptance: slash/prefix spellings, options, permissions, success/error output and legacy/blueprint references. Check names and aliases for collisions.
2. Run `pnpm ririko generate command status-example`. Names match `/^[a-z][a-z0-9-]{0,31}$/`: a lowercase initial letter, at most 32 total letters/digits/hyphens. The generator checks manifest name `ririko`, refuses symlink/non-directory ancestors and atomically creates a new directory; it never overwrites an existing command.
3. Inspect `packages/discord/src/commands/status-example/command.ts`, `command.test.ts` and `README.md`. The generated definition returns a working status string; replace it with the real feature and meaningful tests. A disk failure can leave a partial directory: preserve/inspect it before recovery rather than rerunning blindly.
4. Import the definition into [builtins.ts](../packages/discord/src/builtins.ts) and include it in `createBuiltinCommands`. Registration is manual. Bot dispatch, CLI synchronization and help must consume this one factory.
5. Add option metadata, permissions, aliases, guild restriction, module and examples through [command contracts](../packages/discord/src/contracts.ts). Inject stateful services explicitly; avoid driver/provider code in command metadata or handlers.
6. Test equivalent slash/prefix inputs, invalid options, denied permissions, disabled module and actual failures. The generated test proves only its sample status response, not authorization or Discord delivery.
7. Run the focused test, lint/typecheck and `command:list --json`; update [commands.md](commands.md) and requirement evidence. Explicitly synchronize the intended development guild, then exercise both transports before claiming live parity.

## Manual extension procedures for planned generators

Only `generate command` exists. `generate:command`, `generate module`, `generate adapter`, `generate service`, `generate game`, `generate migration`, `generate dashboard-module` and other generator families are **unavailable**. Their future automation should preserve the procedures below.

### Application service or module

1. Choose one use case and define input, output, errors and narrow repository interfaces. Trusted transport identity uses `ActorContext`; core contracts must not import Discord.js or drivers.
2. Specify authorization and transaction boundaries before implementation. Validation precedes mutation; idempotency/revision/audit invariants belong with persistence. Define concurrent-call and database-failure behavior.
3. Implement with injected store/clock/provider dependencies and deterministic tests. Add a workspace only for working code; follow [architecture](architecture.md) dependency direction.
4. Compose the service at the application entry points. A module needs executable behavior, installed metadata and explicit enable/disable semantics; an inert toggle is not support. Keep core administration recoverable.
5. Bind bot and CLI to the same service; later bind authenticated dashboard requests. Test cross-guild denial at the service boundary. Define the fate of accepted jobs when disabling a module in [modules.md](modules.md).

### Provider adapter

1. Read [adapters.md](adapters.md) and the domain plan. Verify primary documentation for supported operations/models, credentials, quotas/costs, cancellation and retry guarantees.
2. Define bounded requests, normalized responses and errors: unsupported capability, invalid input, authentication, throttling, temporary failure and unknown external completion. Not every exception is retryable.
3. Map vendor behavior behind an injected client. Choose installed adapters through validated configuration; do not construct arbitrary endpoints from untrusted input. Keep secrets out of logs and snapshots.
4. Test timeouts, cancellation, malformed results, duplicate attempts, rate limits and exhausted fallbacks with fixtures. Live probes require a controlled account/budget and separate operation/model/date evidence.
5. Expose the adapter after service/configuration integration. `provider:test` does not exist; specify it in a future ticket instead of inventing an invocation.

### Game or card behavior

1. Read [economy.md](economy.md), [waifu-tcg.md](waifu-tcg.md) and the legacy contract. Define legal states, actors, deadlines, rules version and terminal results.
2. Keep deterministic rules independent of Discord rendering, with injected clock/random inputs. Preserve replay inputs/version/seed without secrets.
3. Define ownership, wager reservation, settlement and cancellation transactions first. Duplicate/late moves must not award twice; timeout and final-move races must yield one terminal result.
4. Test invalid transitions, concurrent settlement, restart recovery and conservation of funds/items. Reauthorize every interaction against user/guild/session identity. Proposed `MiniGame` and card contracts remain designs until implementation/tests exist.

### Dashboard configuration

1. `apps/web` is planned. Establish the authenticated server boundary from [dashboard.md](dashboard.md); do not reuse the local CLI actor.
2. Select one installed module and shared schema/service. Specify read/save/conflict/denied/loading/unavailable states before styling.
3. Derive actor and guild permissions server-side. Reject forged guilds, stale sessions and cross-site mutations. Never return provider secrets to the browser.
4. Save against an expected revision; conflict requires rereading and user reconciliation. Test the same accepted/rejected values across service, CLI and browser. A future generator must not duplicate validation logic.

### Schema migration or legacy import

1. Read [database.md](database.md), [migrations.md](migrations.md) and [migration-1.x-to-2.0.md](migration-1.x-to-2.0.md). Schema creation and legacy import are different operations.
2. Define repository and both-dialect behavior first; coordinate schema review before consumers. Preserve source IDs/raw evidence and specify anomaly handling.
3. Introduce forward-versioned SQL/history support in its own implementation ticket. Current foundation code verifies exactly version 1; changing released statements/checksum is not a safe version-2 migration.
4. Test prior-schema upgrade, repeat apply, interruption, checksum/future mismatch, constraints and restore from verified backup. Run repository contracts against both SQLite and PostgreSQL.
5. A future importer needs dry-run/apply/verify/recovery and representative data. `migrate:legacy`, `db:backup` and `db:restore` are unavailable. Copying a live legacy SQLite file into the new schema path is not migration.

## Build and targeted verification

Development exports resolve source under `--conditions=development`; production resolves compiled JavaScript. `pnpm build` compiles project references and excludes tests from production output. `pnpm start` needs a successful build and starts only the bot. `pnpm dev` runs TypeScript without a watch flag: restart after edits.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

See [testing.md](testing.md) for fixtures and recorded outcomes. A focused test is `pnpm exec vitest run --project unit apps/cli/src/cli.test.ts`. If pnpm's system shim is mismatched but dependencies are installed, direct entry points avoid that shim:

```sh
node node_modules/vitest/vitest.mjs run --project unit apps/cli/src/cli.test.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.check.json
node node_modules/eslint/bin/eslint.js apps packages tests tools
node tools/workboard/cli.ts check
```

| Symptom | Investigation and next action |
|---|---|
| `.env` edit ignored | Check inherited variable names without printing secrets; confirm root working directory |
| Missing native binding | Check Node/OS/architecture and build log; use pinned install/rebuild with required native tools |
| Missing database / migration required | Confirm a separate new development database, then explicitly migrate; preserve unknown existing files |
| Generic CLI error | Check numeric IDs/configuration and targeted tests; unexpected errors are redacted, not successful |
| Doctor missing-token failure with green tests | Offline tests do not establish live credentials; configure a development bot when needed |
| Module unavailable / core disable denied | Inspect installed metadata; planned modules are not registrations and core recovery is intentional |
| New command absent | Check factory registration, metadata list and explicit development-guild sync; help filters inaccessible commands |
| CLI update delayed in bot | Allow documented TTL and confirm same database/guild; investigate conflicts without rewriting revisions |
| Health port occupied | Identify the owner or select a different port; do not terminate an unknown service |
| Production import error | Build references and use compiled exports; do not mask absent artifacts with TypeScript loaders |
| Board lock / stale state / wrong target | Follow [work-management.md](work-management.md); never bypass hooks or guess ancestry |

Record command, commit, environment, exit code and material skips in the handoff. Unit success alone does not establish live Discord/provider behavior, Docker execution or production-data migration.
