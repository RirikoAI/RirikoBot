# Handover Notes: [TICKET-ID] <Title>

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · YYYY-MM-DDTHH:mm:ssZ · <coordinator agent/model>

**Approach**
- How the work should be done, in steps.

**Relevant code** (from CodeGraph during grooming)
- `path/to/file.ts:42` `Symbol.method`: why it matters.

**Pitfalls**
- Non-obvious constraints, edge cases, or traps found while exploring.

**Out of scope**
- What the worker must not change.

---

## PROGRESS · YYYY-MM-DDTHH:mm:ssZ · <worker agent/model> · PAUSED | BLOCKED | REVIEW | ABANDONED

**Files changed**
- `path/to/file.ts`: what changed.

**Verification**
- `verify_cmd` result (pass/fail, with the failing test names).
- Git branch and commit hash (if any).

**Decisions & gotchas**
- Choices made and why.

**New CodeGraph queries**
- Queries that helped and were not in the ticket's `context.codegraph_queries`.

**Next steps**
- What the next agent should do.

**Unblock condition** (BLOCKED only)
- What must change before work can continue, and who can change it.

---

## REVIEW · YYYY-MM-DDTHH:mm:ssZ · <coordinator agent/model> · DONE | REWORK

**verify_cmd rerun**
- Result of the coordinator's own run.

**Acceptance**
- [x] Each acceptance item, checked against the diff.

**Issues** (REWORK only)
- What the next worker must fix. The ticket goes back to TODO.

---

## FLAG · YYYY-MM-DDTHH:mm:ssZ · from <SOURCE-TICKET-ID> · <agent/model>

**Finding**: what was found, with `path/to/file.ts:line`.
**Impact on this ticket**: why it matters here and what to do about it.
