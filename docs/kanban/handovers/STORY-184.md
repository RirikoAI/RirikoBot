# Handover Notes: [STORY-184] Accountable Server Inviters: Invite Through the Dashboard and Show Who to Contact

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-09T16:02:24Z · claude-opus-5-5 (coordinator)

**Approach**
- Maintainer request (2026-10-10, GMT+8): every server must trace back to a contactable person, and the Servers tab shows "username (ID)" for owner and inviter, so the maintainer can reach out or report abuse.
- Three layers:
  1. The owner ID is always known (Discord sends it with every guild, no permission needed). It is already stored in `guilds.owner_id`.
  2. The inviter: the dashboard invite flow (TASK-1841) records the user who authorized the bot. Discord adds the bot only after our callback exchanges the code once the maintainer turns on **Requires OAuth2 Code Grant** in the Developer Portal, so every future invite has a definite inviter. The bot also reads the guild integrations list when the audit log is unavailable.
  3. When no inviter is known (older servers), the page names the owner as the contact (TASK-1842).
- Order: TASK-1841, then TASK-1842.

**Maintainer steps (manual, after deploy)**
1. Developer Portal, OAuth2: add the redirect `${DASHBOARD_URL}/api/invite/callback`.
2. Installation: Install Link "Custom URL" `${DASHBOARD_URL}/api/invite`.
3. Bot: turn on Requires OAuth2 Code Grant. Doing this before the callback is live blocks every invite.

**Out of scope**
- Contacting or reporting users from the dashboard, abuse thresholds.

---

## REVIEW · 2026-10-10T00:45:00Z · claude-opus-5-5 (coordinator) · DONE

**Acceptance**
- [x] TASK-1841 (DONE): dashboard invite flow records the authorizing user (`oauth`), bot falls back to the integrations list, `invited_via` stored.
- [x] TASK-1842 (DONE): Servers tab shows owner and inviter as `username (ID)`, the inviter source, and the owner as contact when no inviter is known.
- Maintainer steps after deploy (Developer Portal): add the invite redirect URI, set the custom Install Link, then turn on Requires OAuth2 Code Grant. Check a test invite on staging first.

**Worker tier**
- Executed through its two tasks on the `medium` tier.
