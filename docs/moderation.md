# Moderation 2.0 & Safety Subsystem Specification

## 1. Overview & Architectural Goals
Moderation 2.0 replaces the legacy stubs in Ririko 1.4.0 with a production-grade moderation and auto-moderation engine. It features dynamic warning escalation, centralized permission validation, staff case notes, and deep integration with Discord's native AutoMod API as specified in Sections 12 and 73 of `BLUEPRINT.md`.

---

## 2. Centralized Permission Service

In compliance with Section 73 of `BLUEPRINT.md`, permission checks are centralized rather than scattered across individual command files. For any privileged action, the `PermissionService` verifies five distinct criteria:
1. **Discord Permissions**: Does the invoking user have the required Discord bitfield (e.g. `BanMembers`, `ManageMessages`)?
2. **Bot Permissions**: Does Ririko's bot account have the requisite Discord bitfield to carry out the action?
3. **Role Hierarchy**: Is the executor's highest role strictly superior to the target user's highest role? Is Ririko's highest role superior to the target user's highest role?
4. **Ririko Module Policy**: Is the moderation module enabled in `guild_settings`?
5. **Channel Overrides**: Is the command or action permitted in the specific channel?

---

## 3. Punitive Actions & Case Management

### 3.1. Supported Punitive Actions
- `/warn <@user> <reason> [severity]` — Issues a formal warning.
- `/timeout <@user> <duration> [reason]` — Issues a Discord communication timeout.
- `/kick <@user> [reason]` — Removes user from the server.
- `/softban <@user> [days_of_messages] [reason]` — Bans and immediately unbans to purge message history.
- `/ban <@user> [days_of_messages] [reason]` — Permanently bans user.
- `/unban <user_id> [reason]` — Revokes an active ban.
- `/purge <count | user: @user>` — Bulk deletes messages with user and invite filters.
- `/lock [channel]` / `/unlock [channel]` — Toggles `SendMessages` permissions for `@everyone`.
- `/nick <@user> [new_nick]` — Moderates offensive or non-decodable nicknames.

### 3.2. Case Audit Logging & Moderation Notes
- Every punitive action generates an immutable `moderation_cases` record with a sequential per-guild case number (e.g. `Case #1042`).
- Cases are dispatched as rich embeds to the guild's configured `log_channel_id` (set on the dashboard Logging page or with `ririko guild:config <guild_id> logging.logChannelId <channel_id>`). The bot subscribes `ModerationLogService` to `moderation:caseCreated` once at startup.
- Staff can attach persistent notes to suspect members via `/note add <@user> <content>` and view full disciplinary history via `/history <@user>`.

---

## 4. Configurable Warning Escalation Engine

Warning thresholds are **fully configurable** by guild administrators via the dashboard and CLI:

```typescript
export interface EscalationStep {
  warnThreshold: number;
  action: 'WARN' | 'TIMEOUT' | 'KICK' | 'BAN';
  durationSeconds?: number;
}
```

### Example Policy:
- 1 Warning $\rightarrow$ Formal logged warning DM.
- 2 Warnings $\rightarrow$ Second warning DM.
- 3 Warnings $\rightarrow$ 10-minute timeout.
- 4 Warnings $\rightarrow$ 1-hour timeout.
- 5 Warnings $\rightarrow$ 24-hour timeout.
- 6 Warnings $\rightarrow$ Permanent server ban.

Warnings support expiration dates (e.g. active for 30 days) and severity weights.

### Storage and Matching (STORY-114)
- The policy lives in `guild_settings.escalation_steps` (JSON). `null` means the default policy above, and an empty list means warnings never escalate. `EscalationStepSchema`, `EscalationPolicySchema` and `DEFAULT_ESCALATION_STEPS` are defined once in `packages/core/src/config/moderation-settings.ts`.
- Rules: 1 to 20 steps, thresholds from 1 to 100 and unique, timeouts from 1 minute to 28 days and only on `TIMEOUT` steps. Steps are saved sorted by threshold.
- Edit it on the dashboard Moderation page (needs a passkey check from the last five minutes) or with `ririko guild:config <guild_id> moderation.escalationSteps '<json>'`.
- On each new warning the score is the sum of the member's active warning severities, and the step with the highest threshold at or below the score applies. A step therefore applies again on every later warning while the score stays at or above it.
- If the settings cannot be read, the warning is already saved, but the error is reported and no step, DM or case follows. The default policy is never used as a fallback, because it could ban members in a guild that turned escalation off.

---

## 5. Automated Defense & Auto-Moderation Pipeline

AutoMod combines Discord native rules with Ririko's custom high-speed pattern engine:

```typescript
export interface ModerationRule {
  readonly id: string;
  readonly name: string;
  
  evaluate(context: ModerationContext): Promise<RuleResult>;
}

export interface RuleResult {
  matched: boolean;
  action: 'ALLOW' | 'DELETE' | 'WARN' | 'TIMEOUT';
  reason?: string;
}
```

### Automated Protection Modules:
1. **Invite Filter**: Detects Discord invite links (`discord.gg/*`, `discord.com/invite/*`) unless sent by authorized staff or within whitelisted advertising channels.
2. **Scam & Phishing Shield**: Matches URLs against real-time phishing domain feeds and detects obfuscated homoglyphs (e.g. `d1sc0rd-nitro.gift`).
3. **Mention Spam**: Flags messages containing $>N$ user/role mentions within a single message.
4. **Message & Burst Spam**: Flags duplicate messages sent within a short sliding window.
5. **Anti-Raid / Join Gate**: Detects abnormal influxes of account creations joining simultaneously, automatically enabling verification gates.
6. **Attachment & Sticker Spam**: Limits rapid multi-attachment posting by unverified members.

### What the Bot Runs Today (STORY-114)
- Four rules run on every guild message, in this order, stopping at the first match: phishing shield, invite filter, mention spam, burst spam. Anti-raid runs on member joins. Attachment/sticker spam does not exist yet.
- Settings per rule are stored in `moderation_rules` (one row per guild and rule type): on/off, action, threshold (mention spam: mentions per message; burst spam: messages within 3 seconds; both match when exceeded), exempt roles and exempt channels. A guild without a row gets `AUTOMOD_RULE_DEFAULTS` from `@ririko/core`: on, `DELETE`, threshold 5.
- Edit them on the dashboard AutoMod page, with `ririko guild:config <guild_id> automod.<key> <value>`, or toggle a rule with `/automod enable|disable`. The bot caches rules for five minutes and drops the cache when the change feed reports an `automod` change.
- Every match deletes the message. The action adds: `WARN` issues a warning through the escalation engine (so AutoMod warnings count toward the policy), `TIMEOUT` times the member out for 10 minutes, `KICK` and `BAN` kick or ban. Punishments run through `WarningEscalationService` and `ModerationActionService` with Ririko's own member as the actor, so permission and role-hierarchy checks apply and a case is recorded.
- Bots, the server owner and members with Administrator, Manage Server, Manage Messages, Timeout Members or Ban Members are always exempt.
