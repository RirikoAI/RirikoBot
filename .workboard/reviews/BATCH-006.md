# RIR-006 — restore local Docker engine startup

Docker Desktop could not start because Windows refused access to its transient socket endpoints. Preserving the two-endpoint runtime directory restored startup; a direct CLI restart reproduced the defect. Launching through the Windows shell then passed a clean stop/relaunch cycle and isolated container execution. This PR records the host repair, reproducible workaround, limitations and user-approved RIR-003 pause. No application code or system configuration is changed by this repository diff.

Head fix/RIR-006-docker-engine targets develop/2.0.0-astra at7ed2073a1673f7a558e4a4221b6c6c20ccdee0a8. One five-point bug; inherited changes are administrative receipts only. Original RIR-003 and prior PR publication branches are preserved.

Validation: two non-root/read-only/network-isolated smoke containers passed from a fixed existing image; normal stop plus shell relaunch passed; settings SHA256 unchanged; post-recovery nine images/seven stopped containers/three volumes retained. Both endpoint backups preserved. Board/requirements/diff checks pass. This is a tested operational workaround, not a proven underlying Windows fix. Ririko container validation remains paused under RIR-003; no application unit rerun or full deployment claim.

See .workboard/handoffs/RIR-006/002-completion.md for exact commands, evidence, failed restart and recovery limits. Publication awaits the user's concrete approval.
