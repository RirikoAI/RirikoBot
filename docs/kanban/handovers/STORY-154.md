# Handover Note: [STORY-154] Season 1 Infernal Crucible Boss Roster & Floor Seed Data

- **Ticket Type & Points**: Story | 5 pts
- **Parent**: `EPIC-015`
- **Author / Agent**: Claude Code (Opus 5)
- **Status**: DONE
- **Timestamp**: 2026-09-19T16:20:00Z

## 1. Summary of Work Accomplished
- [s1_infernal_crucible.json](file:///Z:/Projects/ririko-v2-2026/assets/tcg/catalog/bosses/s1_infernal_crucible.json): the Season 1 roster, 26 FIRE/EARTH anime characters.
  - **Major bosses** (unique mechanics):
    - F10 Megumin: glass cannon; *Explosion* costs 100 MP, so it lands after five turns at 3× damage and teaches Defend timing.
    - F20 Mikasa Ackerman: fast, high crit.
    - F30 Mereoleona Vermillion: enrages early, on turn 8.
    - F40 Rias Gremory: 3-layer WATER/EARTH/ICE ward.
    - F50 Shana: finale; all stats up, 3-layer ward, harsher enrage.
  - **Mini-bosses:**
    - F5 Maki Oze: tanky.
    - F15 Darkness: damage sponge, delayed enrage.
    - F25 Eris Greyrat: fast crits.
    - F35 Holo: frequent cheap skills.
    - F45 Tohru: dragon breath plus a WATER ward.
  - **Standard pools:** 6 characters rotate through F1–19 and 10 different characters through F21–49. Each appears at most 3 times and never on back-to-back floors.
  - Every boss has an original title, original flavor text and a unique named skill.
  - API fields (AniList id, Danbooru tag, art) are pre-filled from the card character catalog. Art was downloaded with `--sync`, and all 26 portraits rendered and were checked.
- Planner: standard bosses take an optional `floorRange`. Each standard floor picks the least-used in-range boss that is not the previous one.
- **Ward fix (pre-existing blocker):** wards absorbed 100% of off-element hits, and dungeon battles are 1v1, so every multi-element ward (the default F30+ wards, Rias, Shana) was unbreakable. Season wards now take 25% chip damage from off-element strikes (`DEFAULT_OFF_ELEMENT_WARD_CHIP`), with a clear log message. The tutorial keeps strict 0% wards for its lesson. Carried as `FloorEncounter.wardOffElementChip`.
- Docs: [waifu-tcg.md §7.7](file:///Z:/Projects/ririko-v2-2026/docs/waifu-tcg.md) covers the boss catalog, builder commands, S1 roster and ward rule. `assets/tcg/catalog/` is added to `.prettierignore` so builder-written JSON stays stable.
- Local dev DB: added the `dungeon_bosses` table (additive) and imported S1 with `pnpm tcg:boss-builder --import-db`.

## 2. Current State & Verification
- New [s1-boss-roster.test.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/__tests__/s1-boss-roster.test.ts) (4 tests) validates the committed catalog:
  - All 50 floors are covered, with 10 unique mini/major bosses.
  - No back-to-back repeats, and the F1–19 and F21–49 pools don't overlap.
  - Each boss appears at most 3 times.
  - Every boss has a title, flavor text, a theme element and a unique skill.
  - Off-element ward chip behaves as designed (seasonal vs tutorial).
- `pnpm typecheck` clean, eslint 0 errors. `pnpm test` green except the live-network music extractor tests (unrelated).
- Simulator on the imported S1: F1–9 are winnable. The F5 mini-boss sits at 3–9% for newbie/starter, and F20+ is 0% even for endgame.

## 3. Roadblocks, Gotchas & Decisions Made
- **S1 is not balanced yet, deliberately.** The season curve is still the old `EXPONENTIAL` defaults (`affixStartFloor: 6` is the only change). Floors 20+ outscale every gear set in the catalog. STORY-156 (gear power budget) and STORY-159 (curve tuning against `S1_TARGET_BANDS`) fix that, by editing `season.scalingParams` in this catalog and re-running `--import-db`.
- `signatureDropCode` is left empty until STORY-156 adds themed signature gear.
- Deployments: run `pnpm db:push` (PG) or `db:reset`/`db:push` (SQLite) for the `dungeon_bosses` table, then `pnpm tcg:boss-builder --all`. The bot still falls back to generated bosses when the table is empty.
- Boss art usually matches the character's card art (same top Danbooru portrait). The asset row is shared by hash, so takedowns apply to both.

## 4. Actionable Next Steps
- STORY-155: show `session.bossProfile` art and flavor on the battle screen.
