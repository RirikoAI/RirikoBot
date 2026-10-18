# STORY-130 — Unified `/react` Command (68 Reactions, Autocomplete & Legacy Prefix Aliases) & OtakuGIFs Cache

- **Epic**: `EPIC-013` (Media Synthesis, Anime Reactions & AI Image Generation)
- **Points**: 5 (`TASK-1301` = 2, `TASK-1302` = 3)
- **Status**: `REVIEW`
- **Date**: 2026-09-23
- **Branch**: `develop/2.0.0` (uncommitted working tree at time of writing)

---

## 1. Summary

Legacy 1.4.0 shipped one command file per anime reaction — **68** of them, each subclassing
`ReactBase.class.ts` and hitting `api.otakugifs.xyz`. 2.0.0 collapses all of them into a single
dual-dispatch command:

- **Slash**: `/react type:<autocomplete> [target:@user]` — one global slash command instead of 68,
  which keeps a large margin under Discord's 100-command application limit.
- **Prefix**: `!react hug @user` canonically, plus every reaction name registered as an alias
  (`!hug @user`, `!kiss @user`, …) so 1.4.0 muscle memory is preserved verbatim.

Reaction phrasing (`description`, `content`, `noTargetContent`) is transcribed byte-for-byte from
the legacy command files, so user-visible output is identical to 1.4.0.

### Grooming decisions recorded for EPIC-013

| Ticket | Before | After | Reason |
|---|---|---|---|
| `EPIC-013` | 13 | 21 | Children re-estimated to 18; next Fibonacci step is 21. |
| `STORY-130` | 3 | 5 | Framework additions + 68-entry parity catalog + cache/fallback + tests. |
| `STORY-131` | 3 | 5 | 11 canvas templates, avatar fetch with SSRF guard, font/layout work. |
| `STORY-133` | 2 | 3 | SSRF verification plus dual welcome/farewell event paths. |
| `STORY-132` | 5 | 5 | Unchanged. |

The same consolidation pattern is intended for `STORY-131`: a single `/meme template:<autocomplete>`
command with the 11 legacy template names as prefix aliases.

---

## 2. What Was Built

### TASK-1301 — Framework plumbing and the reaction catalog

- `packages/discord/src/command/types.ts`
  - `CommandOptionDefinition.autocomplete?: boolean` — Discord caps STRING `choices` at 25, and the
    catalog holds 68 reactions, so the `type` option must be autocompleted rather than enumerated.
  - `CommandContext.invokedName` — the name the user actually typed (lowercased). `commandName`
    keeps its prior meaning: the command's canonical primary name. This is what lets a single
    command tell `!hug` apart from `!kiss`.
  - `CommandCategory.REACTIONS`.
- `packages/discord/src/rest/sync.ts` — emits `autocomplete: true` in the REST payload. When an
  option carries both `choices` and `autocomplete`, autocomplete wins and choices are dropped,
  because Discord rejects a payload containing both.
- `packages/discord/src/command/context.ts` — `SlashCommandContext.invokedName` from
  `interaction.commandName`; `PrefixCommandContext` gained an **optional** 6th constructor
  parameter so existing call sites keep compiling, defaulting to the command's primary name.
- `packages/discord/src/router/router.ts` — passes the raw invoked token (`tokens[0]`) through as
  `invokedName`.
- `packages/discord/src/help/types.ts` — `CATEGORY_INFO` entry (🎭 Reactions). The help generator
  iterates `CATEGORY_INFO` generically, so no other help change was needed.
- `packages/services/src/reactions/reactions.catalog.ts` — `REACTION_CATALOG` (68 entries),
  `ReactionDefinition`, `REACTION_NAMES`, `getReaction(name)`, `searchReactions(query, limit = 25)`
  (prefix-ranked before substring, case-insensitive, capped at Discord's 25-result limit). Pure
  module: no I/O, no Discord imports.

### TASK-1302 — Service and command

- `packages/services/src/reactions/otakugifs.client.ts` — typed client over the existing
  `fetchWithRetry` / `RateLimiter` layer in `packages/services/src/http` (no new HTTP stack, no
  axios). Validates the requested reaction against the catalog **before** building the URL and
  URL-encodes the slug, so no unvalidated user string ever reaches the request. Throws
  `UnknownReactionError` on an unknown name and throws on non-2xx or a missing `url`, leaving
  outage policy to the service.
- `packages/services/src/reactions/reaction-gif.service.ts` — `ReactionGifService`, a per-reaction
  in-memory URL pool. Policy: pool bounded at `maxPoolSize` (default 20, oldest evicted first); a
  pool is *warm* once it holds ≥ `minWarmSize` (default 5) URLs fetched within `ttlMs` (default
  30 min). A warm pool serves a random fresh URL with no network call and fires a background top-up
  when below the cap; a cold pool fetches synchronously. **Offline fallback**: if the live fetch
  fails, any cached URL is served even past TTL (flagged `stale`); only an empty pool resolves to
  `null`. The service never throws at the command layer. Clock and RNG are injectable for
  deterministic tests.
- `apps/bot/src/commands/reactions/react.command.ts` + `index.ts` — `createReactCommand(services)`
  following the `anime/waifu.command.ts` factory pattern. Implements `autocomplete()` via
  `searchReactions(...)`, resolves the reaction from `ctx.invokedName` (falling back to the `type`
  option / first raw arg when invoked as `react`), and renders legacy-identical replies:
  `<@user> <content> <@target>`, or `<@user> <noTargetContent>` when there is no target or the
  target is the invoker. On total fetch failure it reproduces legacy's exact embed text
  (`Error fetching the image.` / `You'll have to use your imagination for this one!`).
- `apps/bot/src/services.ts`, `apps/bot/src/main.ts`, `apps/bot/src/index.ts` — service and command
  group wiring.

---

## 3. Verification

Run from the repo root:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- `pnpm typecheck` — pass, all 8 workspace projects.
- `pnpm lint` — exit 0, 0 errors (554 pre-existing `no-explicit-any` warnings in unrelated files).
- `pnpm test` — **162 files / 1519 tests passing**, up from 159 / 1491 before this story. The new
  suites are `reactions.catalog.test.ts` (14), `otakugifs.client.test.ts` (6),
  `reaction-gif.service.test.ts` (10) and `react.command.test.ts` (12). All HTTP is mocked; no test
  performs a real network call.

Both gate runs above were re-verified by the orchestrator after the sub-agent reported, not taken
on trust.

---

## 4. Gotchas

- **68 reactions, not 60.** `docs/legacy-feature-inventory.md` §2.11 says 60 and lists fewer names.
  The legacy directory is authoritative; the catalog was generated by parsing every non-spec
  `.command.ts` file in `.local/RirikoBot/src/command/reactions/`. The inventory doc is still stale
  and worth correcting.
- **`stopit` → `reactionType: 'stop'`.** The command name and the otakugifs slug differ for this
  one entry. Preserved deliberately; do not "fix" it.
- **`roll` alias collision.** `apps/bot/src/commands/games/dice.command.ts` already registers `roll`
  as an alias of `/dice`, and `CommandRegistry.register` **throws** on alias collision, which would
  stop the bot booting. So 67 of 68 names are registered as bare prefix aliases; the `roll`
  reaction stays reachable via `/react type:roll` and `!react roll` only. This is documented inline
  in `react.command.ts`. Any future command adding an alias must check it against
  `REACTION_NAMES`.
- **Prefix mention resolution.** Alias dispatch (`!hug @user`) has no `type` token occupying the
  slot before `target`, so `PrefixOptionsResolver`'s positional lookup cannot be used; the command
  resolves the mention directly from the raw args.
- **`invokedName` is now required on `CommandContext`.** Hand-built mock contexts in
  `apps/bot/src/commands/{ai,economy,music}/commands.test.ts` had to be updated. Any new test that
  fabricates a context object must include it.
- **Local `dist/` rebuild.** `apps/bot` resolves `@ririko/services` / `@ririko/discord` through
  their build output, so those packages must be rebuilt after the new exports land. `dist/` is
  gitignored.

---

## 5. Next Steps

1. **Review and PR.** The working tree holds both tasks plus these Kanban updates; nothing is
   committed yet. Suggested branch `feat/STORY-130-unified-react-command` targeting
   `develop/2.0.0`.
2. **Correct `docs/legacy-feature-inventory.md` §2.11** to say 68 reactions and to describe the
   unified `/react` target instead of a "command factory" (small chore).
3. **`STORY-131`** is next in `EPIC-013` and should reuse this pattern: `/meme template:<autocomplete>`
   plus the 11 legacy template names as prefix aliases, with the same alias-collision check.
4. **Optional product call**: if a bare-word shortcut for the `roll` reaction is wanted, give it a
   distinct alias (e.g. `!reactroll`); it is intentionally absent today.
