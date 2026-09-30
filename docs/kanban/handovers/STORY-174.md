# STORY-174 — Scoped Command Registration (Global vs Per-Server) & CLI Command Sync

REVIEW (2026-09-30), 8 points, `EPIC-003`. Branch `feat/STORY-174-command-scopes` from `develop/2.0.0`. PR: https://github.com/RirikoAI/RirikoBot/pull/668

## Why

Discord allows 100 slash commands per scope (global, and separately each server), plus 15
message and 15 user context menus. The bot sent all of its 116 slash commands to one scope, so
Discord rejected the whole request and nothing registered. The startup log showed only a
generic error. The client kept showing 84 stale global commands and 64 per-server commands
from an older build. Adding a command also needed a restart with `SYNC_COMMANDS=true`.

## What changed

| Task | Summary |
|---|---|
| TASK-1741 | 17 legacy aliases are prefix-only (`slashEnabled: false`): `gcreate gend greroll gdelete gedit glist` (`/giveaway`), `avc` (`/autovoice`), `vname vlimit vlock vunlock vpermit vkick vclaim vtransfer` (`/voice`), `subscribe unsubscribe` (`/stream`). `!gcreate` and the rest still work. |
| TASK-1742 | `CommandMetadata.registrationScope` (`'global'` default, `'guild'`). `CommandSynchronizer.generatePayloads({ scope })`: context menus are global only. `syncGlobal` / `syncGuild` send their own scope. `COMMAND_LIMITS` / `countPayloads` and a guard that throws `ValidationError` before any REST call. Shared `listBotGuilds` (paginated). 31 admin/setup commands are tagged `'guild'`. |
| TASK-1743 | `apps/bot/src/command-set.ts`: `createCommandControllers` and `registerBotCommands`, extracted from `main()` with no behavior change. The CLI reuses them. |
| TASK-1744 | `ririko commands:sync [--global] [--guild <id>]... [--all-guilds]`. Without a target it prints slot usage and writes nothing. It builds the commands on an in-memory SQLite database, so it never touches bot data. `ririko commands:reset [--yes]` lists or clears every registered scope. |
| TASK-1745 | `SYNC_COMMANDS=true` registers the global set, then the per-server set in `DISCORD_DEV_GUILD_ID` or in every server. A `guildCreate` listener registers the per-server set when the bot joins a server. Docs: `SETUP.md` step 8, `docs/commands.md`, `.env.example`. |

## Allocation (current)

- **Global:** 68/100 slash commands and 1/15 message menus ("Translate to English").
- **Per server:** 31/100 slash commands.
- `apps/bot/src/command-set.test.ts` pins the per-server list. It fails when either scope goes
  over a limit.

## Verification

- `pnpm build`: passes.
- `pnpm lint`: 0 errors.
- Prettier: passes on the changed files.
- `pnpm test:coverage`: passes the coverage gate (2570 passed, 5 skipped).
- Live dry run: `pnpm cli commands:sync` reports global 68/100, message 1/15 and per server
  31/100. It wrote nothing and exited in about 9 s.
- Earlier live run: `pnpm cli commands:reset --yes` cleared the stale global and per-server
  commands on the dev application.
- Not yet done: a live `commands:sync --global --guild <id>` against Discord, and a check in the
  Discord client.

## Gotchas

- Global commands can take a while to appear in Discord. Press Ctrl+R. Per-server commands
  appear immediately.
- `DISCORD_DEV_GUILD_ID` now limits only where the per-server commands go at startup. The global
  set always registers, so development and production should use separate applications.
- A new slash command defaults to global. Admin and setup commands need
  `registrationScope: 'guild'` and an entry in `GUILD_SCOPED` in `command-set.test.ts`.
- `vunlock` delegates to the `lock` action (`autovoice.command.ts`). This may be an existing bug.
  It is out of scope here and was not changed.

## Next steps

1. `pnpm cli commands:sync --global --guild 1304124818412802060`
2. Press Ctrl+R in Discord. Confirm that the admin commands show only in that server, and that
   member commands also show in DMs.
3. Review and merge the PR.
