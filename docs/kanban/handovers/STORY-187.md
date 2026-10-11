# STORY-187 · Privacy and Secret Audit Before 2.0.0 Goes Public on master

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-10T20:59:20Z · claude-opus-5-5 (coordinator)

**Why first**: everything after this ticket gets more readers (master, Docusaurus, Docker Hub). Clean the tree first (TASK-1871), then report on history and GitHub text (TASK-1872). A history rewrite or a GitHub edit is the maintainer's decision.

**Rule**: the private runbook stays git-ignored (`docs/hosting.md`). Placeholders: 192.0.2.x, 198.51.100.x, 203.0.113.x, 2001:db8::, `<domain>`.

## REVIEW · 2026-10-11T10:01:53Z · claude-opus-5-5 (coordinator) · DONE

TASK-1871 (scrub, committed 7aabe9d after one REWORK) and TASK-1872 (history and GitHub audit, report only) are DONE. `pnpm format:check` and `pnpm lint --quiet` pass. The tree passes the new pre-release privacy scan in `docs/testing.md` section 4.4.

The maintainer decisions from the TASK-1872 report (listed in the private report in `.local/audit/`) stay open with the maintainer. They do not block STORY-188. TASK-1911 requires TASK-1872 and is now unblocked on that side.
