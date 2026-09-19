# Handover Note: [STORY-150] Card EXP from Dungeon Wins & Real Skill MP Cost in Combat

- **Ticket Type & Points**: Story | 3 pts
- **Parent**: `EPIC-015`
- **Author / Agent**: Claude Code (Opus 5)
- **Status**: DONE
- **Timestamp**: 2026-09-19T13:40:00Z

## 1. Summary of Work Accomplished
- [card-progression.service.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/card/card-progression.service.ts) (new)
  - `getDungeonCardExp(floor, { victory, isFirstClear, forfeited })`
    - Win: `40 + 25 × floor`, doubled on first clear.
    - Real defeat: 20% of the repeat-clear value, so stuck players still grow.
    - Forfeit: 0.
  - `CardProgressionService.grantExp(userCardId, amount)` uses `LevelingEngine` and caps at the rarity's `maxLevel` (`RARITY_TIERS`).
  - `formatCardExpResult` formats the line shown on the result screen.
- [dungeon-runner.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/dungeon/dungeon-runner.ts)
  - New `cardProgression` option.
  - `finalizeBattleResult` and `runFloor` grant card EXP to the cards that fought.
  - `DungeonRunResult.cardExp: CardExpResult[]`.
  - Tutorial battles earn card EXP too: a full clear takes a starter to about Lv.3 before Season 1.
- [dungeon-battle-session.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/dungeon/dungeon-battle-session.ts): `wasForfeited`, so surrendering cannot farm defeat EXP.
- [card-generator.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/card/card-generator.ts): `resolveSkillMpCost(description, element)` reads `Costs N MP` from the skill description (all 366 manifest cards use that form) and falls back to the element default.
- [loadout-service.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/equipment/loadout-service.ts): `buildCombatant(userCard, team)` and `buildActiveParty(userId, team)` are the single place that turns an owned card into a combatant (level scaling, real MP cost, gear). They replace two copy-pasted builders in the bot (`dungeon-battle.manager.ts`, `game.command.ts`) that hard-coded `skillManaCost: 50`.
- Bot: the dungeon result screen shows card EXP and level-ups. `services.ts` wires `CardProgressionService`.

## 2. Current State & Verification
- New [card-progression.test.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/__tests__/card-progression.test.ts) (5 tests, real SQLite): EXP formula, level-up and max-level cap, combatant built with real MP cost + level scaling + gear, runner grants EXP on a win and none on a forfeit.
- Bot TCG command tests: 65/65. Mocks now bind the real `LoadoutService` builder methods.
- `pnpm typecheck`: clean.
- `pnpm test`: 1134/1141. The 7 failures are in `packages/music` extractor tests, which call live SoundCloud/YouTube (HTTP 403 and timeouts). No music code was touched.

## 3. Roadblocks, Gotchas & Decisions Made
- Account XP from loot is unchanged. Card EXP is a separate, per-card progression.
- `applyLoadoutToCombatant` still ignores `critDamage`, `mitigation`, `manaMax` and other secondary gear stats. STORY-156 (gear power budget) owns that.
- EXP numbers are the first tuning pass; STORY-152's simulator and STORY-159 will retune them.

## 4. Actionable Next Steps
- STORY-151: DB-driven season curves and `dungeon_bosses` table. Regenerate `SQLITE_SCHEMA_DDL` there (stale, see BUG-0010 handover).
