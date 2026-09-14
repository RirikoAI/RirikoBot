# Implemented commands

The current foundation implements three commands. The [legacy inventory](legacy-feature-inventory.md) lists the remaining compatibility work; unimplemented features are not registered as placeholders.

Use the server's configured prefix in place of `!`. The dispatcher resolves the same command and handler for slash, prefix, aliases, and supported context menus. Prefix commands require a server. Slash ping/help can run without a guild; prefix management requires a guild and Manage Server permission.

| Command | Slash | Prefix | Access |
|---|---|---|---|
| Ping | `/ping` | `!ping` | Available to members; one-second cooldown |
| View prefix | `/prefix` | `!prefix` | Manage Server (`ManageGuild`) |
| Change prefix | `/prefix newprefix:?` | `!prefix ?` or `!setprefix ?` | Manage Server; shared settings service persists the change |
| Help | `/help` | `!help` | Shows commands available to the requesting actor |
| Search help | `/help command:prefix` | `!help prefix` or `!help --command prefix` | Matches names, aliases and descriptions |
| Category/page | `/help category:general page:1` | `!help --category general --page 1` | Category and page are optional |

Ping also preserves the legacy user menu **Ping from user context** and message menu **Ping from chat context**. It displays response latency (message/interaction age at dispatch), not WebSocket round-trip time. These menus use the same access checks and cooldown as `/ping`.

The legacy prefix slash option is named `newprefix`; the alias is `setprefix`. Viewing and changing the prefix require `ManageGuild`, as in the audited legacy metadata. Bot ownership does not bypass server permissions. Prefixes contain 1–16 characters without whitespace/control characters. Updates invalidate the shared settings cache; changes made by another process become visible within the core cache lifetime (five seconds by default).

## Prefix input

Quotes preserve spaces, backslashes escape the next character, and no shell expansion or evaluation occurs. Named arguments support `--name value` and `--name=value`. `--` ends named-option parsing. Positional values fill the remaining declared options in order. Example: `!help "server prefix"` searches for one phrase; `!prefix -- "--"` sets a literal two-dash prefix. Escape a literal backslash as `\\`.

Unknown options, duplicate named options, malformed quoting, extra values, invalid integer/boolean/mention values, and missing required options produce validation errors. Input is bounded to 4,000 characters and 100 tokens. The registry supports one-word aliases and two-word aliases such as the legacy `giveaway create`, when those commands are implemented.

## Developer contract

`packages/discord/src/contracts.ts` defines framework-neutral metadata, invocation arguments, actor/settings context, and result models. The package does not import Discord.js or perform database mutations itself.

```ts
import { CommandDispatcher, CommandRegistry, createBuiltinCommands } from '@ririko/discord';

const registry = new CommandRegistry();
for (const command of createBuiltinCommands(settings, registry)) registry.register(command);
const dispatcher = new CommandDispatcher({ registry, settings });

const result = await dispatcher.dispatch({
  actor, transport: 'slash', name: 'prefix', args: { newprefix: '?' },
});
const prefixResult = await dispatcher.dispatchPrefix('?help', actor);
```

The transport supplies authenticated `ActorContext`, including member/bot permissions, role IDs, guild/channel IDs and owner status. Actor identity must never come from command arguments or model output. The dispatcher verifies guild scope, owner restriction, member/bot permissions, module enablement, command enablement, role restrictions, channel blocks and cooldown before awaiting the handler. Disabled policy applies to aliases and context menus. Unknown modules fail closed. Moderation/role commands must additionally validate target hierarchy at the transport/service boundary when implemented.

`CommandRegistry.list()` returns registration metadata. Definitions presently support the flat primitive options needed by these working commands; nested subcommands and autocomplete contracts remain work for feature implementation. Registering a command snapshots its metadata and rejects name/alias/context collisions before changing registry state. Prefix lookup needs at most two map probes; slash and context lookup each use one map lookup.

`CommandRegistry.getHelp({ actor, settings, search?, category?, page?, pageSize? })` filters using the same access policy, omits hidden commands, sorts names/categories, clamps pages, and substitutes the current prefix in examples. Entries include aliases, permissions and cooldowns. The bot renders category select menus and previous/next buttons, binds each menu to its requester/guild/channel, and rechecks permissions on use. Sessions expire after ten minutes and reset on restart; the session map is bounded. Search uses the command option. Dashboard links await the dashboard implementation.

All results have `content`. Their discriminant is `kind: 'text' | 'help' | 'error'`; errors also expose a stable `code` and request ephemeral delivery. The transport uses command `defaultEphemeral` metadata before deferring: prefix administration, help and context menus are private; ping is public. Discord cannot change visibility after acknowledgment, so failures of an already public command remain public and contain safe generic text. Only expected `AppError` messages are exposed. The transport suppresses automatic mentions, awaits handlers and logs metadata without user content/secrets.

Cooldowns are per canonical command, guild and user across transports. Expired state is reclaimed when needed; the map is bounded to 10,000 entries by default. Full capacity rejects a new claim rather than evicting an active restriction. Claims occur before awaiting handlers, so concurrent requests cannot bypass them. Cooldowns are process-local and reset on restart; distributed/shared cooldown storage remains a future scale requirement.

## Verification

`packages/discord/src/dispatcher.test.ts` exercises quoted/escaped prefix parsing, validation, alias collision atomicity, canonical alias routing, slash/prefix equivalence, concurrent request isolation, awaited failure handling, permission/owner/bot/module/channel/role enforcement, dynamic help filtering/pagination, bounded cooldown behavior, persistent prefix changes and ping context menus. No live Discord registration or gateway test is implied by these unit tests.
