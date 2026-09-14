# Moderation design — pending implementation
The foundation supplies permission/hierarchy primitives; it does not register moderation commands. Keep legacy ban/kick/delete/lock/unlock/admin-note interfaces and document security corrections.

A service checks Discord and Ririko permissions, module/channel configuration, target hierarchy and bot capability before any action. Store a case/audit record and evidence reference; preserve old lock overwrite state for unlock. Warning escalation is guild configuration, not hardcoded example thresholds. Track active/expired severity, author and timestamp.

Define ModerationRule before implementing spam/repeats/mentions/invites/links/attachments/emoji/raid policies. Prefer suitable native Discord AutoMod controls. Rules produce structured decisions; actions are mediated. Test threshold boundaries, expired warnings, permission failures and duplicate events without probabilistic assertions. Message content retention should be limited to necessary evidence, with configured retention.

