# CHORE-2001 · bootstrap.sh Deploy-Key Summary Wording

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-10T20:59:20Z · claude-opus-5-5 (coordinator)

**Seen**: the staging bootstrap rerun on 2026-10-11 printed "CI deploy key: NOT installed (run again with --deploy-key)" although it kept the existing key.

**Approach**: find the summary in `deploy/host/bootstrap.sh`: grep "NOT installed", and the `authorized_keys` handling near lines 345 to 365. Detect an existing `restrict,command="/usr/local/bin/ririko-deploy-ssh` line.
