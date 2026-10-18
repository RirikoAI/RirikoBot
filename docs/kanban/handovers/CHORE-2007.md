# Handover Notes: CHORE-2007 Docker Hub Texts After latest Moved to 2.0.0

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-18T12:48:23Z · claude-opus-5-5 (coordinator)

**Facts**: `ririkoai/ririkobot:1.4.0` now holds the 1.4.0 digest, and `latest` of both images points to the 2.0.0 manifests (checked with `docker buildx imagetools inspect`). GitHub release v2.0.0 is published and says that `latest` moved. The maintainer already pasted the new `latest` rows on Docker Hub.

**Approach**: change the two table rows to the text in the acceptance (from the TASK-1913 PROGRESS entry). In docs/release.md section 3 add one step before "Open the file": on the repository page on Docker Hub, leave "Public view mode", then open the Overview editor.

**Out of scope**: any other wording in the Docker Hub texts.

---

## PROGRESS · 2026-10-18T12:50:35Z · ticket-worker (haiku-5-5) · claude-haiku-5-5 · REVIEW

**Files changed**
- `docs/dockerhub/ririkobot.md`: the `latest` row (line 19) now reads `| \`latest\` | The newest 2.x release. Pin a version tag instead. |`.
- `docs/dockerhub/ririkobot-dashboard.md`: the `latest` row (line 19) now reads the same text.
- `docs/release.md`: section 3 has a new step 1 ("On Docker Hub, open the repository page and leave **Public view mode**. The **Overview** can be edited only outside that mode."). The old steps 1 to 3 are now 2 to 4. No other text changed.

**Verification**
- `pnpm format:check` (verify_cmd): pass, "All matched files use Prettier code style!".
- Acceptance: the two `latest` rows match the exact text; section 3 names "Public view mode" before the copy steps; nothing else in those files changed (`git diff` shows +1/-1 per dockerhub file and +4/-3 in release.md).
- Not committed. Branch: chore/EPIC-020-latest-and-cves.

**Decisions & gotchas**
- The new step 1 uses the wording given in the coordinator's setup text. It names no separate repository for the view mode step; the step says "the repository page", as the grooming note does.
- The coordinator's uncommitted edits (BUG-0049 and CHORE-2007 grooming, BOARD.md, board.json) were kept as they were. Only the CHORE-2007 claim and status changed in `board.json`.

**New CodeGraph queries**
- None. The ticket query `releaseTags RELEASE_TAG_PATTERN` returned only release-tag code (`scripts/release-tags.ts`) and did not cover these docs.

**Next steps**
- Coordinator reviews the diff, reruns `pnpm format:check`, checks acceptance, and writes the REVIEW entry for DONE.
- The maintainer applies the Docker Hub Overview edits when the repository is in edit mode. The docs do not change Docker Hub itself.

## REVIEW · 2026-10-18T12:51:52Z · claude-opus-5-5 (coordinator) · DONE

**verify_cmd rerun**: `pnpm format:check` passes. Worker tier small (Haiku), matches.

**Acceptance**: both `latest` rows match the text exactly; release.md section 3 starts with leaving "Public view mode"; nothing else changed.

**Outcome**: DONE.
