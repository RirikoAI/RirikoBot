# Dashboard workflows and authorization

## Status, scope and architecture

`apps/web` does not exist in the current foundation. There is no dashboard, OAuth/session implementation, web API, browser mutation service or browser E2E evidence. Next.js 16 App Router and React 19 are proposed choices; [dependency evaluation](dependency-evaluation.md) records candidate versions, not installed web dependencies. This guide addresses blueprint 42–46, 59–62, 70–74 and 81–83. [ADR-008](adr/ADR-008-web-dashboard-architecture.md) owns the web architecture decision; [ADR-011](adr/ADR-011-secrets-management-and-credential-security.md) owns credential lifecycle. [Requirements](requirements.md) retains all implementation gaps.

The full Gemini `docs/dashboard.md` at `1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33` is the comparison baseline. Its broad module coverage is retained below, with explicit actors, state, errors, audit and unavailable behavior. A framework does not automatically supply application authorization, a generic CLI configuration interface or guaranteed instant permission revocation. Every route, DTO and workflow below is proposed unless labeled current.

Proposed topology: browser → Next.js server edge → shared application services → repositories/providers. Client components handle interactions and receive minimal safe DTOs; server components load authorized views through a server-only data layer. Route Handlers and Server Actions are thin authenticated adapters to the same services used by Discord and the CLI. Do not shell out to the CLI, run a Discord Gateway in every web worker or write domain tables directly from a component. A narrow internal bot-status/job interface can bridge the separate processes; its authentication and failure semantics must be implemented before live controls.

Proposed navigation separates **My Servers**, a chosen guild's administration pages, **My Collection/Profile**, and a restricted **Operator** area. Guild management does not confer global economy/content/credential authority. Preserve the guild name/icon and scope indicator across forms; a route change must never submit an old guild's draft to the new guild. Public collection/help views use separate allowlisted DTOs from private administrative views.

## OAuth, sessions and current guild authority

Discord's authorization-code flow, `identify`/`guilds` scopes and state parameter support the proposed login/discovery flow. `guilds` gives basic guild information; it does not by itself supply every member/role fact needed for a privileged operation. Additional member-read functionality requires the appropriate authorized API/scopes. Login and bot installation are separate flows. [Discord OAuth2 documentation](https://docs.discord.com/developers/topics/oauth2).

Project login contract:

1. Generate a cryptographically random, expiring, single-use state record tied to the initiating browser flow. Store only an allowlisted relative return path; no arbitrary redirect URL. Use an exact configured callback URI.
2. At callback, reject missing/mismatched/expired/consumed state and provider denial before establishing a session. Exchange the code server-side; never put access/refresh tokens into browser storage, HTML, URLs or action results. Do not log callback codes or query strings.
3. Resolve Discord identity server-side and establish a new opaque session ID, storing a hash of its bearer value and expiry/revocation metadata server-side. Rotate any pre-login session identity. The cookie contains no provider token or enduring guild permission grant.
4. Use a host-only Secure, HttpOnly cookie with an explicitly selected SameSite policy compatible with the OAuth redirect. Define idle and absolute session lifetimes; refresh cannot extend an absolute lifetime forever. Serialize token refresh so concurrent requests do not race token replacement. A failed/revoked refresh terminates access rather than falling back to stale credentials.
5. Logout is a protected mutation: invalidate the server session and clear the cookie. Support revoking other sessions and disconnecting the OAuth authorization as separate explicit actions. Browser back/forward caches and open tabs must recheck before showing protected data or submitting changes.

Use an established compatible authentication library after reviewing its actual session and Discord-provider behavior; no library is selected or installed here. Next.js distinguishes optimistic navigation checks from secure server authorization and recommends a centralized data layer and minimal DTOs. A page redirect alone does not protect an independently callable mutation. [Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication).

### Authorization algorithm

For every protected read and mutation, validate the session and parse the route/resource IDs. Guild-scoped operations resolve current guild membership/authority, confirm the bot's membership where required, and evaluate Ririko policy. Personal collection operations instead verify the owner; faction operations check membership/rank; operator operations check separate deployment authority. They do not require an unrelated selected Discord guild. Guild ownership, Administrator or Manage Server can admit the general guild administration area; a moderation/role/music action can require additional operation-specific permission, target hierarchy, channel access and bot capability. Do not infer authority from the selected guild card, browser-submitted permissions, an ID's syntax or a historical row in the database. Discord permission bitfields need exact integer handling; Administrator and channel/role hierarchy rules must use the shared permission adapter. [Discord permissions](https://docs.discord.com/developers/topics/permissions).

The guild selector may cache display names/icons, but eligibility is revalidated on protected requests and again before queued external effects. For writes, obtain fresh authoritative facts or reject with `AUTHORIZATION_UNAVAILABLE`; do not silently use a successful permission check from yesterday. A permission change can still race the final effect because Discord and SQL are separate systems. Record the check time and reject on detected revocation; do not promise mathematically instantaneous revocation. If Discord is rate limited/unavailable, show a retryable access-verification failure, not “you have no servers” and not permissive cached access.

“My Servers” distinguishes: administrable and bot present; administrable but bot absent (offer installation only if allowed); member without administration access; inaccessible/verification unavailable. Sensitive channel, case, wallet or user data is never included merely to populate the selector. Missing bot membership disables operations and explains the recovery path without making a fake “connected” claim.

### Origin, CSRF, caching and isolation

Next.js Server Actions use POST and compare Origin with Host/forwarded host, with an allowed-origin configuration for proxy deployments. They remain externally callable operations requiring authentication, input validation and authorization. This is not proof that every Route Handler has a CSRF token implementation. [Next.js data security](https://nextjs.org/docs/app/guides/data-security).

Project policy additionally requires explicit same-origin checks on cookie-authenticated mutations and a reviewed CSRF defense covering Route Handlers and logout. Treat missing/null origins according to the selected endpoint policy; browser write endpoints must not become a credentialed cross-origin API accidentally. Configure one canonical public origin, narrowly trusted reverse-proxy headers and explicit permitted origins; do not accept an arbitrary Host header or broad wildcard as authorization. GET/render/prefetch must never mutate settings, reset memory, send a test message, refresh an energy pool or trigger a paid provider call.

Mark database, token and credential modules server-only and prevent client imports. Return only allowlisted fields, including in Server Component payloads, serialized action results, errors and downloads. Never place secrets in `NEXT_PUBLIC_` variables. Authenticated pages/API responses use private no-store behavior by default; any deliberate cache must be keyed by subject, guild, authorization scope, schema/revision and freshness needs. Never share a user's case list through a cache keyed only by page name. Reauthorize before serving protected cached content; cache invalidation cannot replace permissions.

Scope exports and background jobs exactly like interactive requests. Use authenticated downloads with short-lived, audience-bound references; no public bucket URL for a moderation or configuration export. Apply response security headers and restrictive embedding/content policies appropriate to the deployed frontend. Image previews and provider endpoint tests must use the shared SSRF/media rules, not direct server fetch of an administrator-supplied URL.

## Shared configuration and browser concurrency

Current source: `packages/core/src/settings.ts`, `contracts.ts`, `permissions.ts`; `apps/cli/src/cli.ts`; database settings adapters. The existing `SettingsService` supports `get`, `setPrefix` and `setModule`. Only core is installed and essential. Prefix is 1–16 JavaScript string code units without whitespace/control characters. `commands` policies exist in the schema, but there is no complete command-policy editing service or CLI writer. `channels[id] = true` is not an exclusive allowlist; only explicit false denies. Built-in permissions, module/command gates and configured role/channel restrictions compose restrictively.

The service uses a five-second default local cache, invalidates around its own writes, and asks the repository to save with an expected revision and actor audit. That expected revision is read by the service at mutation time. It is **not** the revision displayed when a browser form opened. [ADR-013](adr/ADR-013-configuration-permissions-and-concurrency.md) explains this gap and the current cache's multi-process limits.

Before introducing web editing, extend the shared application API to accept the displayed revision. Do not bypass the service by calling the repository directly. Illustrative future DTOs:

```ts
interface PrefixEdit {
  guildId: string;
  expectedRevision: number;
  operationId: string;
  prefix: string;
}

interface SettingsView {
  guildId: string;
  revision: number;
  prefix: string;
  source: 'operator-default' | 'guild';
  canEdit: boolean;
  observedAt: string;
}

type SaveResult =
  | { status: 'saved'; revision: number; operationId: string }
  | { status: 'accepted'; operationId: string; effect: 'pending' }
  | { status: 'conflict'; current: SettingsView }
  | { status: 'rejected'; code: string; fieldErrors?: Record<string, string> };
```

The server constructs actor context from authenticated facts, not this DTO. Strict schemas reject unknown fields, invalid IDs and unsafe numeric ranges; resource ownership is checked after syntax validation. Field errors identify safe paths/messages without echoing secrets. Module forms derive from shared typed schemas plus a small UI metadata layer for labels, help, units, scope, sensitivity and capability prerequisites. Do not duplicate validation rules manually or expose every JSON property as an editable field.

Worked stale-form case: A opens revision 12; B saves revision 13; A submits prefix `?` with expected 12. Return conflict and safe current fields, preserve A's draft locally in memory, show what changed, and let A reload or deliberately reapply to 13. Never silently retry the stale snapshot. Repeating A's already committed request with the same operation identity returns its receipt; changing its payload conflicts. Local draft storage must exclude secrets and private prompts; refreshing after reauthentication may require reentry.

A form displays stored override, effective value, source layer, permitted override range and applied/observed status. Removing an override is a distinct action that previews the inherited value. Security limits cannot be relaxed by a user/channel preference. The blueprint hierarchy is field-specific: language/timezone preferences may inherit; quota ceilings, privileged tool access and global coin issuance do not follow unrestricted last-writer-wins merging.

### Settings save versus external effect

Saving desired configuration is not proof of Discord/provider success. A role-message publish, AutoMod change, stream subscription or announcement needs an operation receipt and durable effect state: pending, applying, applied, rejected, partially applied, or unknown. Store configuration/audit/outbox intent atomically, then let a bounded worker reauthorize and perform the external effect. Present desired revision, last applied revision, last checked time and actionable error.

Example: save three reaction-role mappings, create the Discord message, then lose the response before recording its ID. The receipt is not “failed, safely retry all.” Mark the effect unknown, reconcile using available provider/message evidence, and only retry a step proven safe. Editing the mappings meanwhile creates a new desired revision; the old worker cannot overwrite the new status. A failed Discord step does not erase an audit record or silently undo unrelated settings. Cancellation blocks future work; it cannot unsend a delivered message. [Adapters](adapters.md) owns outbox, retry and unknown-outcome rules.

## Administration workflow catalog

All pages below are proposed. “Manager” means a currently authorized guild administrator plus any narrower module/operation permission. “Operator” is a separate authenticated deployment/content authority; neither a browser boolean nor Manage Guild grants it. A TCG player-guild/faction officer is authorized by that faction's membership/rank, independently of Discord guild management.

Every workflow returns scope, capability/installation state, observed time and revision; every mutation records actor, operation ID, safe field diff, rule/version and result. The table names extra audit evidence and domain-specific failure/empty behavior. Zero rows, unavailable integration, denied access, loading and stale data are different states. An empty form must not invent a successful default deployment.

| Page / actor | Read and action workflow | Audit, failure and empty-state contract |
|---|---|---|
| Overview / manager | Guild identity, bot connection, module availability, safe aggregate usage and recent incidents; navigate to the affected module. | Read-only refresh never enables modules. Missing telemetry says unavailable/as-of, not zero errors or healthy. No global infrastructure details in a guild view. |
| General, Prefix, Appearance / manager | Prefix; future language/timezone, embed color and appearance settings; preview inherited/default values and submit a bounded revision-aware change. | Store safe before/after and source layer. Invalid/deleted channel or asset blocks only the relevant setting. Prefix is the only currently implemented field in this group. |
| Commands and Help / manager; public discovery separately | Registry-derived names, aliases, usage, permissions, module requirements and availability; future enable/role/channel overrides and permission simulation. | Do not weaken built-in requirements. Show unknown/uninstalled entries as unavailable. Before policy editing ships, provide an authenticated recovery path for disabled help/config commands; essential core alone does not override individual command policy. |
| Music / manager or authorized DJ action | Volume, DJ roles, voice/text bindings, queue/filter policy and supported source capabilities; queue read/control through the music service. | Audit track/queue revision and operation, not provider secrets. Bot voice/channel permissions, same-channel policy and stale queue errors are visible. Spotify metadata configured does not mean playable audio. Save defaults separately from changing an active player. |
| AI / manager; personal settings for owner | Dedicated channel, personality, allowed model/provider, tool policy, memory retention, quota/budget and time preference; privacy-scoped reset and diagnostics. | Prompt bodies/conversations do not enter generic logs or analytics. Reset binds conversation scope/generation; it cannot erase another user's memory through an arbitrary ID. Missing model/tools capability disables that control; fallback/data-consent policy is visible. |
| Image Generation / manager; personal defaults bounded | Provider/style/default prompt policy, user/guild quota, storage and job status; explicit preview/generate/cancel actions. | A preview may consume resources and states that before submission; merely opening a form makes no provider call. Show queued/running/unknown/cancelled separately. Unsupported editing or paid/unverified access must not appear as a functioning free option. |
| Moderation / authorized staff | Scoped case/history search, warning escalation rules, notes, reasoned actions and retention; recheck actor/bot/target hierarchy. | Case/action revision, reason and settlement receipt; private notes require specific access. Deleted targets, missing permissions and partial Discord effects retain a truthful case status. Never bulk-ban from a filter preview. |
| AutoMod / manager with required permission | Rule builder for supported invite/mention/caps/spam policies, exceptions, thresholds, actions and test examples; inspect Discord-native versus application rules. | Publish rule version and provider rule ID; preview is side-effect free. Capability/Discord rule-limit errors preserve draft. A UI slider is not a guarantee of perfect spam detection. |
| Roles / manager with role authority | Join, bot, verified, temporary and activity-role policies; pick existing roles, expiry and eligibility. | Recheck bot role position and prohibited/managed roles at effect time. Missing roles show broken references, not silent replacement. Revocation/expiry is a tracked job; no blanket role removal when disabling a policy. |
| Reaction Roles / authorized manager | Message preview with button/select/reaction mappings, exclusive groups and eligibility; publish/update a named message. | Store message and mapping revision, exact target roles and effect receipt. Escape mentions; test sends require explicit action. Deleted message or unknown publish outcome triggers reconciliation, not duplicate messages. |
| Giveaways / authorized manager | Active/scheduled/history list; create/edit/end/cancel and explicitly reroll eligible completed giveaways. | Record original winners, reroll identity/reason and eligibility snapshot; never overwrite prior outcome. Empty means none, not watcher failure. Prize settlement and announcement can have different states; retries cannot mint prizes again. |
| Auto Voice / manager | Join-to-create source/category, naming template, user limit and supported bitrate; inspect active managed rooms. | Revalidate channel type/capability and ownership. Cleanup targets only recorded bot-managed rooms under lifecycle rules; disablement does not delete every voice channel or populated room. |
| Stream Alerts / manager | Twitch/YouTube/TikTok/Facebook provider access, subscriptions, target channels, templates, role mentions and last event/delivery. | Per-subscription provider ID, source event and delivery receipt. Unavailable official access is labeled unsupported/unverified. No recent stream, stale watcher and failed delivery differ; test announcement is explicit and deduplicated. |
| Free Games / manager | Epic/Steam/GOG feed/source availability, announcement channels, mention role and last accepted promotions. | Deduplicate promotion/source/destination and validate links. An expired offer or failing feed is not “no free games.” Changing a channel must not replay every old promotion. |
| Welcome / Farewell / manager | Message/embed/canvas preview, safe background and destination; sample data and explicit test send. | Track template/asset version and test destination. Preview sanitizes names/mentions, bounds images and labels sample data. Missing permissions or invalid image gives safe fallback without sending unexpected messages. |
| Economy / manager local policy; operator global policy | Allowed local reward channels/activity settings; scoped statistics and account diagnostics. Global COIN issuance, interest, fees, bank capacity and catalog require operator authority. | All adjustments use balanced ledger/receipts and explicit reasons. No editable balance cell or guild-level global minting. Holds, pending settlement and frozen recovery are visible; unavailable ledger is not zero wealth. |
| XP & Ranking / manager local policy; operator global curve | Guild reward eligibility/announcements, global/guild ranking snapshots, curve and correction previews within authority. | Show curve version, population/ties/as-of; edits do not silently relabel historical karma. Local multipliers remain within global budget; migration/level-down effects require reviewed domain policy. |
| Waifu TCG / delegated local manager; operator content | Collections/help for users; local drop routing/availability; operator content, seasons, curves, energy, consumables and economy-linked controls detailed below. | Actor authority is per field/realm. No active match's frozen rules change because a form saved. Ownership/reservation errors are exposed without granting or deleting assets. |
| Games / manager bounded by operator policy | Enabled game modes, local channels and cooldowns; operator wager/funding limits; session status and recovery. | Show house reserve/capability, stake consent and terminal receipt. Disablement stops new admission but resumes/refunds existing sessions by domain policy; no “clear games” button that deletes liabilities. |
| Logging / authorized manager | Channel bindings for edits/deletes/voice/roles and allowed event classes; retention controls within policy. | Test delivery explicit; avoid logging sensitive payloads by default. Missing log channel is a degraded binding, not successful delivery. Guild logs exclude other guilds and deployment secrets. |
| Integrations / scoped manager; operator credentials | Configured/verified/capability/usage state, scoped secret replacement if delegated, bounded probe and rotation status. | Never return current secret; record credential metadata/version and redacted outcome. Permission to see health is separate from replace/revoke/use authority. |

[Music](music.md), [AI](ai.md), [moderation](moderation.md), [economy](economy.md), [TCG](waifu-tcg.md) and [adapters](adapters.md) own detailed domain behavior. The dashboard displays those service decisions rather than maintaining parallel algorithms.

### TCG administration forms

Separate **Guild TCG** from **Global Content**. A guild TCG-manager role can govern delegated local channels, drop schedule, announcements and permitted moderation. It cannot rewrite global rarity, energy, market fees, reward supply or someone else's faction treasury. Permissions are checked on the server per operation and field; moving a global field into a guild route does not delegate it.

| Form | Inputs, preview and publication contract |
|---|---|
| Drops and rarity | Local channel/active-hours/frequency/claim-window controls stay within global ceilings. Global eight-tier weight editor uses integer weights, eligible pools and a distribution preview. Reject invalid sum, negative weights, empty rarity pool or unsupported pity configuration. Retain seed/version evidence without revealing future draws. |
| Season and tutorial | Draft season ID, start/end/grace times, themes/affixes, floors, tutorial gate and one-time starter bundle. Validate overlapping activation and dependency references. Tutorial disablement cannot grant its reward repeatedly or erase completion. Existing runs retain their published content version. |
| Four difficulty curves | Select Linear, Polynomial, Exponential or Hybrid; expose only that curve's typed coefficients and segment breakpoints. Plot HP/ATK/DEF/SPD across the complete configured floor range, with a numerical table, bounds/overflow and discontinuity warnings. Extreme speed scaling must remain visible as a balance concern. Use the exact shared fixed-point/rational calculation and rounding from TCG, not a second floating-point browser formula. |
| Boss and loot | Enrage opportunity/turn limits, elemental shield layers, first-clear/repeat loot and rewards; validate reachable shields, legal effect references and bounded recursion/triggers. Show loot/supply preview. No arbitrary JavaScript, SQL, cron or executable “affix JSON.” |
| Energy | Global base, scaling, milestones/cap and operation costs; preview levels including displayed level 0 using the TCG normalization, regular/bonus pools and grandfathering. Show old/new capacity and next refill implications. UTC top-up policy is a domain rule, not an editable raw cron string. |
| Consumables and shop | Versioned item effects, allowed acquisition, stock/price, purchase limits and distinct daily use limits. Preview no-effect/full-cap behavior and total possible daily restoration. Candidate one energy-candy purchase/day and three energy-restorer uses/day share canonical TCG UTC counters across guilds. |
| Market, achievements and factions | Operator market fee/rounding/expiry and immutable reward bundles; achievement telemetry/claim status; faction officers' treasury access through faction capability and ledger service. Global COIN stays in one realm; the Discord manager role cannot impersonate a faction leader. |

The TCG document's candidate curves are Linear `1+k*x`, Polynomial `1+a*x+b*x*x`, Exponential `(1+r)^x`, and a continuous piecewise Hybrid, with `x=F−1`. The editor must use the same versioned evaluator as runtime and identify caps/rounding at every plotted point. Gemini's slider ranges are not accepted balance or schema limits. An optimistic-looking chart is not evidence that floors are beatable; attach simulation seed/sample/results and pathological builds before publication.

Content follows draft → validate references/schema → simulate dependencies/curve/supply → review → publish immutable version → activate at declared scope/time. Require a concrete change summary for high-impact publication, season termination or a correction that affects players. A routine safe field save does not require a second blanket confirmation. Do not hot-patch owned assets or active battle arithmetic. Energy reset and potion counters use UTC calendar identities; economy daily claim streak follows its separate rolling policy. The Devotion achievement consumes that existing daily claim event instead of creating a second coin claim.

## Credentials, provider status and safe diagnostics

Credential entry is write-only: a blank replacement field means “leave unchanged,” and removal is a separate deliberate action. Browser typing necessarily exists transiently in the input, but the server never returns a stored secret or masked prefix/suffix. Clear input after submission; exclude it from drafts, analytics, error reporting, HTML attributes, URL parameters, exports and form-validation echoes. Do not repopulate it from a failed response. Secret references are internal handles with usage authority, not browser-selectable access to arbitrary vault entries.

[ADR-011](adr/ADR-011-secrets-management-and-credential-security.md) specifies proposed authenticated encryption, key IDs, rotation and recovery. The dashboard never handles the master encryption key, environment secrets or database credentials. A delegated guild credential may be replaceable by that guild's authorized manager, while global bot/provider credentials remain operator-controlled. Confirm supported scope and provider access before presenting the input; a guild ID does not scope a global provider account automatically.

Use independent status fields rather than one green check:

| Field | User-visible meaning |
|---|---|
| Installed | Adapter code exists in this deployment; it may be intentionally disabled. |
| Enabled | Effective feature policy permits use in the selected scope; this alone does not establish configuration or availability. |
| Configured | Required nonsecret settings and a credential reference exist. This does not validate the credential. |
| Verified | A named bounded check succeeded at the displayed time for the displayed capability; it may now be stale. |
| Capability | This configured model/source supports the requested operation, such as tools, editing, search or playable streaming. |
| Availability | Healthy/degraded/rate-limited/quota-exhausted/unsupported/unknown, with retry time where known. |
| Desired/applied | Configuration revision requested versus revision observed in the relevant runtime/external system. |

Provider probes are explicit operations with budgets, deadlines, request identities and safe fixtures. State whether the check performs a billable generation or external message before starting. A read-only configuration inspection is not a live credential/model/voice test. Never log private prompts or provider responses to explain failures; show a sanitized code, check time and correlation ID. Configured Ollama/ComfyUI endpoints still require endpoint/SSRF policy and capability checks. Hiding unsupported action controls does not mean hiding why an integration is unavailable.

Rotation creates a new credential version, verifies an allowed capability and changes active references under a reviewed lifecycle; old in-flight work retains an explicit version policy. Removal/disablement explains affected modules/jobs and blocks new use without silently deleting historical receipts. Unknown paid-provider outcomes cannot be automatically retried against another provider with private data; fallback requires the domain's consent, capability and budget policy.

## CLI parity and API/read-model contract

Current CLI behavior is verified in `apps/cli/src/cli.ts`; [development](development.md) documents setup and exact command handling. Available configuration examples are `pnpm ririko guild:config <guildId>` and `pnpm ririko guild:config <guildId> --prefix '?'`. `module:list`, `module:enable` and `module:disable` exist, but only the essential core module is installed; disabling it is refused. The claimed `guild:config <id> <key> <value>` interface does not exist.

The local CLI deliberately trusts host/configuration access, attributes writes to the first configured `BOT_OWNER_IDS` value and supplies ManageGuild. It does not verify that person's Discord guild membership. The web edge must construct its own verified actor; invoking the CLI with browser input would improperly grant operator authority. Current CLI configuration reads and prefix/module writes do not establish parity for role policies, providers, TCG content or all dashboard forms.

Future parity means one service/schema and documented equivalent operation for each practical transport, not necessarily identical syntax or identical permissions. Provider tests/listing, generic settings, backup/restore, import/export and preset commands remain unimplemented. Do not show a runnable copy-command button until the corresponding CLI parser/service exists. A future command-policy editor must include actual operator recovery before enabling restrictions that could lock out administration.

Current `health` checks database access; the running bot's readiness endpoint additionally reflects gateway/database/shutdown state. `doctor` inspects a defined set of local configuration/runtime prerequisites and reports optional missing integrations; it is not a live provider certification. The future dashboard should consume authorized health read models rather than expose a raw internal endpoint or label all diagnostics “live.” No current CLI command starts or serves the web app.

Proposed API resources include session summary, guild access, effective settings, capability catalog, operation receipt/status, scoped audit/analytics and content drafts. Exact endpoint names are implementation choices; the DTO/security contract is mandatory. Cursor pagination has bounded page sizes, stable ordering and an explicit scope/version; arbitrary query filters cannot become raw SQL. Monetary values use canonical integer strings; time fields include UTC instants and separately named governing timezone; IDs remain strings. Do not return raw database rows, encrypted credential blobs or private content merely because the UI currently ignores those fields.

| Proposed HTTP/domain failure | UI behavior |
|---|---|
| 400 malformed request / 422 validation | Field-level safe errors plus focused summary; retain nonsensitive draft. No automatic retry. |
| 401 session expired | Reauthenticate; do not replay a mutation automatically after login. Receipt lookup can resolve a previously submitted operation. |
| 403 forbidden / scoped 404 | Explain unavailable access without leaking existence/details of another tenant's resource. Clear privileged cached view. |
| 409 revision conflict | Show current safe fields and submitted draft; require deliberate reapplication. Same-key changed-payload conflicts remain distinct. |
| 429 quota/rate limited | Show retry/eligibility time and affected scope; disable retry spam. Browser backoff does not reset the server quota. |
| 503 authority/provider unavailable | Show unknown/unavailable with check time; preserve durable desired state and do not fabricate zero data. |
| 202 operation accepted | Display receipt and pending effect; poll until terminal, with an explicit unknown/reconciliation state when necessary. |
| Unexpected internal error | Sanitized message and correlation ID; no stack, credential, SQL or raw provider payload in response. |

These statuses are proposed web mappings; the current core exposes `AppError` and safe messages, not this web API. A successful 200 read can contain stale telemetry only when labeled; it cannot carry an unauthorized cached result. A saved response must distinguish committed configuration from completed external effects.

## Analytics, logs, flags and operational workflows

Aggregate dashboards cover commands, active users/guilds within viewer authority, music time/requests, AI/image counts and budgets, economy issuance/fees, moderation actions, stream subscriptions/delivery, games and card drops. Define each metric, denominator, window, timezone, source and as-of time. Global analytics are operator-only; guild managers see their guild's authorized subset. Suppress unnecessary small-cohort or individual behavioral detail. Missing instrumentation means unavailable, not zero, and estimates such as projected provider cost must be labeled rather than presented as a bill.

Retention policy views separate AI conversation content, moderation records, economy provenance, stream events, aggregate analytics and audit logs. A guild manager can select only permitted values/ranges; they cannot delete global receipts needed to prevent duplicate settlement. Preview impact and scope for deletion/export operations, use jobs with progress/receipt and preserve required recovery evidence. Do not default to storing complete message content, prompts, attachment bytes or IP addresses in every audit row. Security telemetry, where justified, has its own minimized fields, access and retention policy.

Audit history shows actor/source, operation, scope, safe changed fields, revision, time and outcome. Search/filter/export stays scoped and paginated. Secret updates show version/reference metadata and “changed,” not contents; AI personality edits show bounded metadata/digest rather than logging the prompt. Current settings audit behavior does not imply this full event catalog exists. Application-log/error pages use redacted structured events and correlation IDs; no arbitrary filesystem log reader, shell command or raw database console is exposed.

| Operational workflow | Reviewable action and recovery |
|---|---|
| Feature flags / modules | Show installed, configured, effective-enabled and unavailable states. Disable new admission with domain-specific drain/cancel/refund policy; essential administration remains recoverable. A global flag is operator-only. |
| Maintenance mode | Operator previews affected scopes and ongoing sessions; activate a declared admission policy. Preserve health, receipt reads and authorized recovery. It does not delete queues or financial liabilities. |
| Permission testing | Side-effect-free evaluation of a selected actor/command/channel/target against fresh facts; explain built-in, role, channel, module, bot and hierarchy gates. The result is diagnostic and can become stale before an actual action. |
| Configuration export | Authorize scope; export schema/version/nonsecret values and unresolved references through a protected job/download. Exclude tokens, prompts by default, private cases and unrelated global configuration. |
| Configuration import | Bound size and schema; reject secrets/executable content/unknown privilege fields. Map channel/role IDs to the destination guild, preview old/new values and validation failures, then apply under displayed revision. Never blindly replay a source guild's IDs or role authority. |
| Presets | Versioned allowlisted settings bundles with scope and compatibility metadata. Preview capability gaps and inherited overrides; no automatic provider spending, live sends, role deletion or global minting. |
| Database backup / restore | Operator-only workflow after a real service/runbook exists; display consistent snapshot, encryption/access and restore verification. Ordinary guild export is not a database backup. No working dashboard or CLI backup/restore facility exists today. |
| Provider test / test announcement | Explicit destination/capability/resource-cost preview and one receipt. A retry uses the same identity; unknown side effects require reconciliation rather than repeated sends. |

Dangerous actions need a concrete affected-scope summary and explicit user action, such as ending a season, rerolling winners, revoking a credential or restoring data. Use typed confirmation only where the cost/risk warrants it. Do not add repeated confirmation dialogs to ordinary reversible settings saves, and never trigger destructive operations from page load, import preview or a scheduled UI refresh.

## Interaction, accessibility and delivery gates

Use consistent labels, units, status language, buttons, pagination, colors and help links across modules. Separate Save, Apply/Test, Cancel and destructive actions. Unsaved edits remain apparent when changing guild/page; submitting disables duplicate clicks but server receipts still enforce deduplication. Restore focus after dialogs/conflicts, preserve keyboard navigation, associate labels/errors with controls, and announce status changes without excessive live-region noise. Status cannot depend on color alone.

Graphs need a numerical table/export and units; drag/slider inputs need keyboard and direct numeric alternatives. Loading skeletons must not look like actual zero usage. Show an informative empty state only after an authorized successful read. Responsive tables preserve field context on narrow screens. Accessibility testing includes keyboard-only operation, screen-reader labels, focus order, contrast, zoom and reduced motion; a component library alone does not prove accessibility.

Proposed live status starts with bounded polling, for example every 15–30 seconds while a tab is visible, with jitter, backoff and immediate stop at terminal operation state. Request-local authorization memoization may avoid repeated checks within one request; it is not a persistent permission cache. Reauthorize each protected poll. Streaming/SSE is deferred until measured need and must then specify reconnect cursors, replay limits, session expiry and permission revocation. The session bounds and authentication candidates are in [ADR-008](adr/ADR-008-web-dashboard-architecture.md); none are installed defaults.

| Acceptance area | Required future evidence |
|---|---|
| OAuth/session | State mismatch/expiry/replay, callback denial, redirect allowlist, session fixation, refresh race, logout/revocation, idle/absolute expiry and missing scopes. |
| Tenant/actor isolation | User A versus B, guild A versus B, direct route/action calls, copied IDs, bot removal, role revocation, faction membership and operator-only fields. Unavailable authority must fail closed. |
| Request boundary | CSRF/cross-origin/null-origin policy, hostile forwarded host, GET/prefetch side effects, strict DTO validation, client import/bundle inspection and private-cache isolation. |
| Settings/concurrency | Displayed revision conflict, two browser writers, browser versus CLI, same-key replay, changed payload, audit rollback, failed read without permissive defaults and policy recovery. |
| Domain/external effects | Save without apply, stale worker revision, partial role/subscription delivery, unknown response, cancellation after submission and restart receipt reconciliation. |
| Credentials/privacy | Secret values absent from HTML/RSC payloads/results/logs/exports/errors; write-only replacement/remove separation; scoped use/rotation, revoked credential and prompt redaction. |
| Module coverage | Every catalog row has permitted/denied, loading/empty/error/unavailable, save/audit and relevant side-effect tests; required help/CLI metadata exists for implemented features. |
| TCG/economy | Shared evaluator matches charts at boundaries; global versus guild permissions, immutable active-run rules, UTC versus rolling counters, inventory/ledger settlement and no form-based minting bypass. |
| UX/operations | Keyboard/screen-reader/mobile flows, stale telemetry, rate-limit backoff, scoped pagination/export/import preview, maintenance drain and restore evidence. |

Use service unit tests, real supported-dialect integration tests, HTTP authorization tests and browser E2E for the implemented web workflows. Browser screenshots alone cannot prove tenant isolation or atomic settlement. Roll out login/read-only discovery first, then revision-aware core settings, selected domain workflows and finally sensitive operator controls after their underlying services exist. Keep each workboard ticket estimated and within the approved epic; this proposed sequence authorizes no extra delivery scope.

No web dependency installation, OAuth login, provider probe, live Discord mutation, browser test or dashboard runtime verification was performed in this documentation ticket. The current foundation's tests cannot certify these unimplemented workflows.
