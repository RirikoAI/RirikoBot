# Development and operator commands
Before implementation, follow [work management](work-management.md), read the current ticket/handoff and run `pnpm board check`. All agents share one active ticket; a new scope requires the user's PR checkpoint decision. Install local guards with `pnpm board install-hooks` in every clone.

Use [the preserved blueprint](../BLUEPRINT.md) and [requirement ledger](requirements.md) to define acceptance. `pnpm board requirements-show BP-07` lists evidence and remaining work for a section; `pnpm board requirements-check` checks source/coverage/reference integrity. These local developer operations have no Discord slash/prefix equivalents.

Use Node 24 LTS, pnpm 10.34.5 and the lockfile. Run commands from the workspace root. `pnpm install --frozen-lockfile` installs exact direct versions and locked transitives. Native SQLite builds may require Python and a C++ build toolchain. See dependency-evaluation.md.

Copy .env.example to .env. Node's built-in environment loader is used; process environment takes precedence. Optional credentials can remain commented until the bot or command sync is needed. Startup validates known fields without printing invalid values. Production secrets come from environment, never source control. .env, databases, audit sources and tool downloads are ignored.

| Command | Behavior |
|---|---|
| pnpm dev | Run bot TypeScript with development package exports |
| pnpm build / pnpm start | Compile project references / run compiled bot |
| pnpm ririko version | Print 2.0.0 |
| pnpm ririko doctor [--json] | Read-only checks; nonzero if required checks fail. Configured credentials are not remotely verified. |
| pnpm ririko migrate | Explicitly create/apply only new foundation schema; refuses foreign/legacy schema |
| pnpm ririko migrate:status | Inspect current/latest checksummed schema versions |
| pnpm ririko health | Database readiness only; gateway readiness comes from running HTTP endpoint |
| pnpm ririko command:list [--json] | Actual metadata, never a manually duplicated feature list |
| pnpm ririko command:sync [--global] | Replace registrations on configured development guild, or explicitly global scope |
| pnpm ririko module:list | Discover implemented modules (currently essential core) |
| pnpm ririko module:enable GUILD MODULE | Enable an installed module through SettingsService |
| pnpm ririko module:disable GUILD MODULE | Disable optional module; core cannot be disabled |
| pnpm ririko guild:config GUILD | Read validated settings |
| pnpm ririko guild:config GUILD --prefix '?' | Persist a prefix using revision checking and actor audit |
| pnpm ririko generate command NAME | Generate working status command, test and slash/prefix docs; refuses overwrites and symlink ancestors |

Local CLI writes are privileged host operations and require BOT_OWNER_IDS. The first configured owner ID labels the audit record; this is not remote Discord OAuth authentication. Protect local host/database access. Dashboard requests must independently authenticate and authorize instead of reusing this local-operator identity.

To add a command, generate its files under packages/discord/src/commands, then add its import/registration in the shared createBuiltinCommands factory in packages/discord/src/builtins.ts. Bot dispatch, CLI synchronization and help all consume that factory; never maintain differing command sets. Put stateful behavior in a tested service and follow the matching specialist's read-first requirements.

The root package exports use development conditions for source and default conditions for compiled JavaScript. Production starts without tsx/TypeScript. Keep package dependencies acyclic and types framework-free in core. Tests are excluded from production tsconfig builds.

Other generator families, legacy import commands, provider testing, cache operations, full backup/restore CLI and dashboard tools are pending; the CLI rejects unimplemented names rather than reporting false success.

