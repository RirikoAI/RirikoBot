# Handover Notes: CHORE-0004 Disable unused FloweryTTS source in Lavalink config

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-04T09:35:00Z · Claude Code (Opus 5.5)

**Source**: `pnpm lavalink:start` fails on a fresh start with `java.lang.IllegalArgumentException: Default voice must be set` from `FloweryTTSSourceManager.<init>` (LavaSrc 4.8.3). The constructor throws when `plugins.lavasrc.flowerytts.voice` is null. The generated config sets `sources.flowerytts: true` and has no `flowerytts:` block. A long-running Lavalink process hid the bug until it stopped today. No bot code uses FloweryTTS (`ftts:`), so disable the source instead of adding a voice.

**Approach**
- In `scripts/lavalink-setup.ts` (`renderLavalinkConfig`, line ~161), change `flowerytts: true` to `flowerytts: false`.
- Regenerate the Docker config: `node scripts/lavalink-setup.ts --docker-config` (or edit `docker/lavalink/application.yml:105` to match; the existing test compares it byte-for-byte with the renderer).
- In `scripts/lavalink-setup.test.ts`, add an assertion that `renderLavalinkConfig(DOCKER_LAVALINK_VALUES)` contains `flowerytts: false` and not `flowerytts: true`.

**Relevant code**
- `scripts/lavalink-setup.ts:161` `renderLavalinkConfig`: emits the lavasrc `sources` block.
- `scripts/lavalink-setup.test.ts:36` docker config parity test.

**Pitfalls**
- `--docker-config` may need `tsx`; if `node` cannot run the .ts file, use `pnpm tsx scripts/lavalink-setup.ts --docker-config`. Do not run the full setup (it downloads jars).
- `lavalink/application.yml` is gitignored local runtime config; the coordinator already patched it. Do not touch it.

**Out of scope**
- Other LavaSrc sources, plugin versions, the skybot plugin update warning.

---

## PROGRESS · 2026-10-04T09:28:00Z · claude-small · REVIEW

**Changes**
- `scripts/lavalink-setup.ts:161`: Changed `flowerytts: true` to `flowerytts: false` in the lavasrc sources configuration.
- `docker/lavalink/application.yml:105`: Updated to match the renderer with `flowerytts: false`.
- `scripts/lavalink-setup.test.ts`: Added test case `disables FloweryTTS source to avoid Default voice error` that asserts the config contains `flowerytts: false` and not `flowerytts: true`.

**Verification**
- `pnpm vitest run scripts/lavalink-setup.test.ts` passed: 1 file, 7 tests (including the new test).
- All acceptance criteria met:
  - renderLavalinkConfig emits `flowerytts: false` under plugins.lavasrc.sources
  - docker/lavalink/application.yml regenerated and matches the renderer
  - scripts/lavalink-setup.test.ts asserts the rendered config has `flowerytts: false` and no `flowerytts: true`
  - Test suite passes

**No flags raised.**

---

## REVIEW · 2026-10-04T09:31:00Z · Claude Code (Opus 5.5) · DONE

**verify_cmd rerun**
- `pnpm vitest run scripts/lavalink-setup.test.ts`: 1 file, 7 tests passed.

**Acceptance**
- [x] `renderLavalinkConfig` emits `flowerytts: false` under `plugins.lavasrc.sources` (`scripts/lavalink-setup.ts:161`).
- [x] `docker/lavalink/application.yml` matches the renderer (parity test passes).
- [x] New test asserts `flowerytts: false` and no `flowerytts: true`.
- [x] verify_cmd passes.

**Worker tier**
- `claude-small` (Haiku) matches the ticket's `small` tier.
