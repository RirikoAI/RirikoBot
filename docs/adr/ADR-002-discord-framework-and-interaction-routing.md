# ADR-002: Discord transport and shared command routing

## Status

Accepted and implemented for the initial registry, dispatcher and ping/prefix/help commands. Full legacy parity, nested feature subcommands, autocomplete and general component routing remain future implementation work.

## Problem

Legacy source contains 141 command files and 68 reactions. Dispatch scans command arrays; prefix calls mutate shared command parameters, and wrappers fail to await asynchronous handlers. Handler declarations do not imply working parity: playlist and secret-setup commands lack prefix handlers, while 11 meme prefix handlers are broken.

## Options considered

- Preserve per-command regex dispatch and repair each transport separately.
- Use a third-party command framework with its own metadata and lifecycle.
- Keep Discord.js at the application boundary and use a framework-neutral registry/dispatcher.

## Decision

Use pinned Discord.js 14 in the bot transport. Define command names, aliases, options, categories, examples, modules and access requirements as typed metadata in `packages/discord`. Normalize slash and prefix arguments into one immutable invocation and await one handler. Commands delegate state changes to services.

Use maps for canonical names, aliases and context routes. The foundation resolves a slash/context name with one map lookup and a prefix with at most two map probes for legacy spaced aliases. Tokenization/validation still takes time proportional to input size; this is not a latency guarantee. Reject collisions during registration. Preserve exact legacy identifiers/options/aliases from the audited manifest as features are implemented.

Apply guild, owner, member/bot permission, module, command, role, channel and cooldown checks before execution. Ownership does not bypass guild permissions. Generate help from accessible metadata and recheck access when a component is used. The transport supplies trusted identity, acknowledges interactions, handles deferred replies and suppresses unintended mentions.

## Consequences

One handler reduces transport drift, while explicit metadata excludes accidental broad regex matches. Context actions and aliases share restrictions. Bounded process-local cooldown state resets on restart and is not a distributed rate limiter. Flat option support is implemented for the foundation; nested subcommands, autocomplete and feature components must be designed/tested before advertising them. No sub-millisecond response target has been measured.

## Validation and evidence

Parser, collision, permission, concurrency, help and cooldown tests cover the foundation; authenticated registration/gateway checks are separate gates. See [implemented command contracts](../commands.md), [exact legacy manifest](../legacy-command-manifest.json), and [settings decision](ADR-013-configuration-permissions-and-concurrency.md). Full parity remains an acceptance task for every migrated feature.
