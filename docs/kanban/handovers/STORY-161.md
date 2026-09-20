# STORY-161 — Unified Configurable Reset Boundary & Consecutive-Miss Streak Forgiveness

**Status**: REVIEW
**Points**: 5
**Epic**: EPIC-004 (requires EPIC-004, EPIC-015)
**Branch**: `feat/STORY-161-configurable-reset-boundary` → `develop/2.0.0`

---

## 1. Summary

Every daily system in the bot previously derived its own calendar day with
`new Date().toISOString().slice(0, 10)`, which hard-coded a UTC-midnight boundary in five
independent places. This story replaces all five with a single shared, configurable reset
boundary defaulting to **00:00 GMT+8**, and converts `/daily` from a rolling 24-hour cooldown
to a calendar-day claim with consecutive-miss streak forgiveness.

### Systems now on the shared boundary

| System | Config key | Previous behaviour |
|---|---|---|
| `/daily` claim & streak | `RIRIKO_RESET_TIME_DAILY` | rolling 24h cooldown + 12h grace |
| Player energy replenishment | `RIRIKO_RESET_TIME_ENERGY` | UTC midnight |
| Energy potion ceiling (3/day) | `RIRIKO_RESET_TIME_ENERGY_POTIONS` | UTC midnight |
| Waifu TCG shop daily rotation | `RIRIKO_RESET_TIME_TCG_SHOP` | UTC midnight |
| Economy shop purchase limits | `RIRIKO_RESET_TIME_SHOP_PURCHASES` | UTC midnight |

---

## 2. Design

### 2.1. Day index, not day string

`packages/core/src/time/reset-schedule.ts` is the single source of truth. A `ResetSchedule` is
`{ offsetMinutes, resetHour, resetMinute }`, and the core primitive returns an **integer day
index** rather than a date string:

```
dayIndex = floor((now + offsetMs - resetTimeMs) / 86_400_000)
```

Shifting by the timezone offset and then back by the boundary time places the boundary exactly
on a UTC midnight, so flooring by whole days yields an index that increments once per reset.

The index matters because `/daily` needs *adjacency*, not equality: "did the player claim
yesterday?" is `todayIndex - lastIndex === 1`. Doing that with `YYYY-MM-DD` strings would need
date parsing and would break across month and year boundaries. `getResetDayKey` still exists for
storage and display (`player_energy.last_reset_date`) and is derived from the index.

### 2.2. One timezone, per-feature clock times

`RIRIKO_RESET_OFFSET_MINUTES` (default `480`) applies to **all** features. Only the wall-clock
time may vary per feature. This is deliberate: five features in five timezones would make "what
day is it" unanswerable for a player, while per-feature times still let operators stagger resets
(e.g. rotating the shop at 06:00 instead of overnight).

`ResetConfigShape` lives in `packages/core/src/time/reset-config.ts` and is spread into
`BaseAppConfigSchema`, so the env fields have exactly one definition. Validation happens at
startup — a malformed `RIRIKO_RESET_TIME` throws rather than silently shifting every reset.

### 2.3. `/daily` streak semantics

Let `gap = todayIndex - lastClaimIndex` and `missedDays = gap - 1`.

| gap | missedDays | Effect |
|---|---|---|
| 0 | — | already claimed today → rejected |
| 1 | 0 | `streak += 1` |
| 2 … threshold | 1 … threshold-1 | `streak += 1`; missed days **skipped, not counted** |
| > threshold | ≥ threshold | `streak` wiped; the triggering claim counts as day 1 |

A 15-day streak interrupted by 2 missed days resumes at **16**, not 18. Any successful claim
clears the miss counter, so forgiveness is *consecutive*, not lifetime.
`RIRIKO_DAILY_STREAK_FORGIVENESS=0` disables forgiveness entirely (any miss ends the streak).

### 2.4. Miss count is derived, not stored

Because any claim clears the counter, `missedDays` only ever accumulates inside a single
unbroken gap — which is exactly `todayIndex - lastIndex - 1`, already recoverable from
`economy_accounts.last_daily_at`.

**No schema change was made.** This avoids a Postgres migration, edits to both dialect schemas,
and an edit to the literal `economy_accounts` DDL string embedded in
`packages/database/src/schema/sqlite/ddl.ts` (hand-maintained and prone to drift). It also makes
desync between the counter and `last_daily_at` structurally impossible.

`DailyStatus` still exposes `missedDays` and `forgivenessRemaining` for embed copy; both are
computed per call.

---

## 3. Files changed

**New**
- `packages/core/src/time/reset-schedule.ts` — schedule type, day index/key, next-reset helpers
- `packages/core/src/time/reset-config.ts` — env shape, per-feature schedule resolution
- `packages/core/src/time/index.ts`
- `packages/core/src/time/reset-schedule.test.ts` — 24 tests
- `packages/services/src/waifu-tcg/__tests__/reset-boundary.test.ts` — 9 tests

**Modified**
- `packages/core/src/config/schema.ts` — spreads `ResetConfigShape`
- `packages/core/src/index.ts` — exports `./time`
- `packages/database/src/repositories/player-energy.repository.ts` — schedule injected via
  constructor; `currentDayKey()` replaces three inline UTC derivations
- `packages/services/src/economy/daily.service.ts` — calendar-day claim + forgiveness
- `packages/services/src/economy/types.ts` — `missedDays`/`forgivenessRemaining` added,
  `graceExpiresAt` removed
- `packages/services/src/economy/inventory.service.ts` — purchase limit compares day indices
- `packages/services/src/waifu-tcg/energy/energy-lifecycle.service.ts`
- `packages/services/src/waifu-tcg/equipment/tcg-shop.service.ts` — `shopDayKey` takes a schedule
- `apps/bot/src/services.ts` — resolves schedules once, injects into all five consumers
- `.env.example`, `docs/economy.md` (new §5.3), `docs/waifu-tcg.md`, `docs/commands.md`,
  `docs/implementation-roadmap.md`

---

## 4. Verification

- `pnpm -r typecheck` — clean.
- `pnpm lint` — 0 errors across all files touched by this story.
- `pnpm test` — **1272 passed**, 29 of them new.

### Pre-existing failures (NOT caused by this story)

Two tests fail on this branch. Both were confirmed failing on a clean `develop/2.0.0` checkout
by stashing this work and re-running them:

1. `packages/database/src/migration/migration.test.ts` —
   `SqliteError: table reaction_roles has no column named type`. The migration engine's test
   fixture DDL was not updated when STORY-140 added `reaction_roles.type`.
2. `packages/services/src/waifu-tcg/__tests__/energy-and-shop.test.ts` →
   *"rejects purchase of non-buyable superior gear"*. Expects
   `/cannot be purchased with credits/` but gets `Insufficient wallet balance`. The test is
   **date-dependent**: `getDailyRotation` seeds its pick from the current day key, and on days
   when `WEAPON_OBSIDIAN_KATANA` lands in the rotation the item becomes purchasable, so the
   guard under test never fires. It passes or fails depending on the calendar date.

Both deserve their own bug tickets; neither was in scope here.

---

## 5. Cutover behaviour (one-time, self-correcting)

Moving the boundary from 16:00 UTC-equivalent to GMT+8 midnight grants a small one-off bonus to
players whose last reset was recorded in the 16:00–24:00 UTC band, because that timestamp now
reads as "yesterday":

- one extra free energy replenishment,
- one extra energy potion allowance,
- one `/daily` claim available earlier than 24h after the last one.

All three correct themselves at the first boundary after deploy. No backfill migration was
written; the cost of one free refill does not justify one.

Players also all start with a full forgiveness budget, since the miss count is derived from
`last_daily_at` rather than persisted.

---

## 6. Gotchas for the next agent

- **`shopDayKey` signature changed** — it now takes an optional `ResetSchedule` second argument.
  Callers that omit it silently get `DEFAULT_RESET_SCHEDULE` (GMT+8 midnight), not UTC.
- **`graceExpiresAt` was removed** from `DailyClaimResult`. It had no meaning under calendar
  semantics. Nothing in `apps/bot` read it, but any new embed code must not expect it.
- **`DailyServiceOptions.cooldownWindowMs` / `graceWindowMs` are gone.** Passing them is now a
  type error.
- **`PlayerEnergyRepository` takes a second constructor argument.** Existing test call sites pass
  only the client and therefore default to GMT+8 midnight; that is intentional and harmless.
- **Tests that assert on a fixed reset-day key must freeze the clock.**
  `getOrReconcileUserEnergy` and `consumeEnergyPotion` read `new Date()` internally and take no
  `now` parameter, so `reset-boundary.test.ts` uses `vi.setSystemTime`. Plain fixture dates will
  produce flaky assertions.
- **`DEFAULT_RESET_SCHEDULE` is the fallback everywhere.** A consumer that forgets to inject the
  configured schedule silently runs on GMT+8 midnight rather than failing loudly. If a future
  feature needs a different default, inject explicitly.

---

## 7. Follow-up

- **BUG-0012** (filed, BACKLOG) — `EnergyLifecycleService` has no callers anywhere in `apps/` or
  `packages/`, so the daily energy replenishment this story now schedules correctly **still never
  fires at runtime**. This story makes the boundary correct and configurable; it does not wire
  the service up. Also noted there: `player_energy.bonus_energy` is written by nothing, and the
  documented half-energy refund on dungeon floor 1–10 defeats has no implementation.
- Two pre-existing test failures above need bug tickets.
