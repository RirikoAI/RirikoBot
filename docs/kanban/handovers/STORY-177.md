# Handover Notes: STORY-177 Lightsail Host Bootstrap & Hosting Runbook

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-04T18:50:17Z · Claude Code (Opus 5.5)

**Approach**
- TASK-1771 first: the bootstrap script and the CI shellcheck step. Later tasks only add files under `deploy/host/bin` and `deploy/host/systemd`; the bootstrap installs whatever is there.
- TASK-1772 last, after every other task of EPIC-017 is DONE, so the runbook describes the real scripts.

**Out of scope**
- Terraform or CloudFormation. The maintainer creates two instances by hand; a runbook is cheaper than infrastructure code for that.

---

## REVIEW · 2026-10-07T11:56:20Z · Claude Code (Opus 5.5) · DONE

- TASK-1771 (bootstrap), BUG-0034 (tar extraction) and TASK-1772 (runbook, now private) are DONE. The bootstrap is proven live on both staging hosts.
