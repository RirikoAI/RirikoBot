# ADR-002: Discord Framework and Interaction Routing

## Status
Accepted

## Context
In Ririko 1.4.0, command dispatching was performed by iterating over an array of all registered commands on every incoming message and interaction, evaluating regular expressions sequentially (`for (const command of this.commands) if (command.test(content))`). This caused O(N) evaluation overhead on every message. Furthermore, commands lacked a structured middleware pipeline for rate limiting, permission checks, and cooldowns.

## Decision
1. **Framework**: Standardize on **Discord.js 14.x** utilizing Gateway v10, REST v10, and modern Component Builders.
2. **Dual-Dispatch Parity**: Every command will support both **Slash Commands** (`/command`) and **Prefix Commands** (`!command` or custom guild prefix) using a shared command execution contract.
3. **O(1) Hash Map Routing**: Index commands, aliases, and subcommands into hash maps for instant constant-time lookup.
4. **Middleware Pipeline**: Introduce a composable middleware chain (RateLimit, GuildOnly, PermissionCheck, Cooldown, Logging) executed prior to invoking command handlers.

## Consequences
### Positive
- Sub-millisecond command dispatch latency even with 150+ registered commands.
- Consistent permission checks and cooldowns applied identically across slash and prefix interactions.
- Dynamic autocomplete and responsive component handling (buttons, select menus, modals) handled through a unified router.

### Negative
- Commands must adhere to structured metadata definitions rather than arbitrary regex matching.
