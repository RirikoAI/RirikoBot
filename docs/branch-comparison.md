# Astra and Gemini: source comparison and response

Compared on 2026-09-14 after fetching both user-named branches from `RirikoAI/RirikoBot`, including a final refresh before the local checkpoint. This is a source/evidence comparison, not a model ranking or a claim that either branch is production-ready.

| Snapshot | Exact commit | Meaning |
|---|---|---|
| Astra remote `develop/2.0.0-astra` | `801103c0e4c70eca6a380d7d1122b11234695bb1` | The source actually visible at the user's Astra link |
| Gemini remote `develop/2.0.0` | `1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33` | Gemini's planning, Kanban and expanded TCG design commits |
| Astra local governance | `dd5a0aef26ae56d4ee826bc54a10c5187f447552` | Completed RIR-001; not pushed, so absent from the remote comparison |
| Preserved local parent | `c1018829abf42fd2f8aad22948de343e51dc1e95` | RIR-001 plus the user's publication-deferral record; parent of RIR-110 |

The user subsequently authorized one separate stacked improvement story, RIR-110, estimated at 13 points before implementation. Its changes are described below and must not be attributed to the earlier remote snapshot. Neither a push nor PR is authorized by the comparison/stacking approval.

## What the source demonstrates

| Area | Astra remote | Gemini remote | Assessment |
|---|---|---|---|
| Executable structure | Five app/library workspaces (six including the root), 30 production TypeScript files under apps/packages | One production TypeScript file, `src/index.ts`, containing a console greeting | Astra has a working foundation; Gemini is a planning scaffold |
| Discord/CLI behavior | Gateway, shared registry/dispatcher, ping/prefix/help, settings, permissions, operator CLI | No gateway, application command router or CLI implementation | Astra is further along in implemented behavior; full command parity remains pending |
| Persistence | Separate Drizzle SQLite/PostgreSQL schemas, settings/audit transactions, migrations and repository tests | Schema and migration design documents | Astra has implemented foundation persistence; neither has a verified production legacy importer |
| Verification | Ten test files; lint/typecheck/unit/integration/E2E/build scripts; CI and Docker definitions | Zero test files and only a `build: tsc` script; no workflow or Dockerfile | Gemini's testing/deployment documents describe intended future work |
| Full source requirements | Original request was only in the attachment/context | Root `BLUEPRINT.md` with the full specification | Gemini's preservation of product intent is better and worth adopting |
| Planning presentation | Concise source-backed status, 13 ADRs, manifests and conservative gates | Detailed subsystem plans, diagrams, broader domain epics and expanded equipment/stamina/seasonal dungeon/achievement specifications | Gemini provides substantially more detail in the TCG progression design; those plans still need implementation, consistency checks and acceptance evidence |
| Work control | Not on Astra remote yet; the separate local RIR-001 adds validated transitions, locking, tests and Git guards | JSON/Markdown board and standing protocol; no transition validator, hooks or board tests | Distinguish the unpushed local implementation from the requested remote comparison |
| Major product modules | Music/AI/moderation/economy/TCG/dashboard not implemented | Same modules described but not implemented | Neither branch fulfills the full Ririko 2.0 acceptance criteria |

Counts came from `git ls-tree -r --name-only` at the fixed refs. Production counts exclude tests and node_modules; workspace counts refer to `apps/*/package.json` and `packages/*/package.json`. These counts help locate real code, not measure correctness or product value.

Source: [Astra package and scripts](https://github.com/RirikoAI/RirikoBot/blob/801103c0e4c70eca6a380d7d1122b11234695bb1/package.json), [Astra built-in commands](https://github.com/RirikoAI/RirikoBot/blob/801103c0e4c70eca6a380d7d1122b11234695bb1/packages/discord/src/builtins.ts), [Astra CI](https://github.com/RirikoAI/RirikoBot/blob/801103c0e4c70eca6a380d7d1122b11234695bb1/.github/workflows/ci.yml), [Gemini runtime](https://github.com/RirikoAI/RirikoBot/blob/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33/src/index.ts), [Gemini package](https://github.com/RirikoAI/RirikoBot/blob/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33/package.json), [Gemini blueprint](https://github.com/RirikoAI/RirikoBot/blob/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33/BLUEPRINT.md).

## New Gemini work included in the final refresh

The initial inspection used `c07c2d6485b50e46041f51be48faa593549c3524`. The final fetch found `1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33`, adding 578 lines and removing 55 across seven documentation files. It expands TCG equipment and accessory slots, rarity-linked battle perks, daily level-scaled energy with consumable caps, tutorial and seasonal dungeon floors, difficulty curves, item shop versus combat loot, multi-asset achievement rewards, proposed schema tables, dashboard controls and command specifications. These are useful design details to evaluate when grooming the TCG epic. [Latest TCG design](https://github.com/RirikoAI/RirikoBot/blob/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33/docs/waifu-tcg.md), [TCG ADR](https://github.com/RirikoAI/RirikoBot/blob/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33/docs/adr/ADR-010-waifu-tcg-pipeline-and-game-design.md).

The update adds no runtime code, dependencies, tests, workflow or board repairs, so the implementation and board findings below remain unchanged. Its contribution guide also explicitly selects `develop/2.0.0` for Gemini's own work. That branch-local instruction does not change Astra's verified integration target; importing it wholesale would send Astra work to the wrong branch. Preserve the original blueprint and current user decisions while reviewing the new game-design proposals in a separately groomed scope. [Changed files](https://github.com/RirikoAI/RirikoBot/commit/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33), [Gemini contribution guide](https://github.com/RirikoAI/RirikoBot/blob/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33/docs/contributing.md).

## Concrete gaps on Gemini's branch

1. **Board drift:** Markdown shows `STORY-010`, `STORY-011` and `STORY-012` as ready, but none exists in its canonical `board.json`. Five `requires` relationships lack inverse `blocks` entries. A next session could select a card that does not exist in the machine record. The `$schema` points to a Markdown protocol, not a JSON Schema. [Board JSON](https://github.com/RirikoAI/RirikoBot/blob/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33/docs/kanban/board.json), [displayed board](https://github.com/RirikoAI/RirikoBot/blob/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33/docs/kanban/BOARD.md).
2. **Conflicting product assumptions:** the roadmap says 60 reactions, while Astra's source-backed audit counts 68. The roadmap and architecture also describe different rarity distributions and six versus seven elements. The blueprint explicitly treats the rarity/type-chart examples as configurable design choices. These need one reviewed design before coding. [Gemini roadmap](https://github.com/RirikoAI/RirikoBot/blob/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33/docs/implementation-roadmap.md), [Gemini architecture](https://github.com/RirikoAI/RirikoBot/blob/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33/docs/architecture.md), [source-backed legacy inventory](legacy-feature-inventory.md).
3. **Requirement substitution:** blueprint section 18 requests initial Twitch, TikTok and Facebook assessments. Gemini's stream plan lists Twitch, YouTube and TikTok. YouTube may be an addition, but should not erase Facebook without an explicit capability assessment and decision. [Gemini architecture](https://github.com/RirikoAI/RirikoBot/blob/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33/docs/architecture.md).
4. **Plans presented more confidently than evidence supports:** fixed dates, sub-100ms interaction/150ms rendering goals and exactly-once notification claims have no implementing code or measurement in that snapshot. They are targets to validate. Several `file:///Z:/...` documentation links also cannot be followed from another machine. [Gemini roadmap](https://github.com/RirikoAI/RirikoBot/blob/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33/docs/implementation-roadmap.md), [Gemini testing strategy](https://github.com/RirikoAI/RirikoBot/blob/1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33/docs/testing.md).

The Gemini application was not installed or run during this comparison: its inspected source and package script inventory are sufficient to establish the narrow implementation scope. That is not a claim that its build fails.

## Gaps I am correcting in Astra

- **Preserve requirements, not just a summary.** [BLUEPRINT.md](../BLUEPRINT.md) now retains the full user attachment. Its original byte hash and newline-normalized content hash are recorded in [requirements.json](requirements.json). Later explicit user workflow instructions still take precedence; the original source is not silently rewritten.
- **Make omissions visible.** [The generated ledger](requirements.md) maps all **91 numbered sections** and **35 exact final acceptance criteria** to source/test/design evidence, truthful status, concrete remaining work and existing backlog scopes. It explicitly retains Facebook assessment, safe image attribution, migration preservation and unfinished product modules. These counts are coverage of the specification, not a percent-complete score.
- **Test the review process.** `board requirements-check` checks source integrity, missing/duplicate/renamed requirements, stale rendered output, invalid ticket references, absent/unsafe evidence paths and implementation claims backed only by documents. It does not pretend a link proves live behavior. CI runs this check before dependency installation.
- **Handle the approved stack honestly.** The Git guard now resolves the immediate PR target from the exact preserved parent commit. A dependent story cannot be sent to the integration branch while hiding its unpublished parent changes. Missing remote parent publication, parent movement, arbitrary local base anchors and undeclared inherited scopes fail closed. Approval includes target branch as well as HEAD/base SHA. Completed-delivery handoffs remain visible on the board.

These changes improve specification retention and delivery verification. They do not add music, AI, TCG or a dashboard. The next product work should still come from one groomed story, such as RIR-210 command parity, after the current delivery checkpoint is resolved.

## Verification and publication boundary

Prior local RIR-001 verification passed 100 tests with seven PostgreSQL cases explicitly skipped; that includes 39 governance tests which are absent from the remote Astra snapshot. RIR-110's current verification is recorded in its [completion handoff](../.workboard/handoffs/RIR-110/003-completion.md); do not treat old test counts as the current suite or documentation as a CI run.

The user's approval allows this local stack only. Governance retains its own chore commit/batch; RIR-110 has its own story branch and checkpoint. Its frozen parent's older PR checker rejects a closed batch; RIR-005 records that issue without starting a second ticket. A separately approved parent **branch push** can make it available as this story's immediate PR base while the parent PR remains deferred. Parent integration needs its own reviewed resolution; no commit is rewritten or hidden. No branch protection, live Discord/provider validation or deployment is claimed by this comparison.
