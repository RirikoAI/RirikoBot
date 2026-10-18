# CHORE-2003 · Dashboard /health SCHEMA_INCOMPATIBLE Label

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-10T20:59:20Z · claude-opus-5-5 (coordinator)

**From BUG-0042's review**: a downgrade-guard refusal reports `MIGRATION_PENDING` with an empty list. Add a `reason` to `SchemaNotReadyError` and map it in `webProbe`.
