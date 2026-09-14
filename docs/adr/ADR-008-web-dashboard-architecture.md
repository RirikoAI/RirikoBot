# ADR-008: Authorized web dashboard and shared service boundary

## Status and evidence

**Proposed; no web application is implemented.** `apps/web`, Discord OAuth login, browser sessions, dashboard routes and browser E2E coverage are absent. The bot foundation exposes only `ping`, `prefix` and `help`. The legacy snapshot contains a static `public/index.html` and informational HTTP controllers, not authenticated guild administration. This ADR addresses BP-42–44, BP-46, BP-54 and BP-72; [dashboard](../dashboard.md) owns the complete workflow catalog and [requirements](../requirements.md) records outstanding implementation.

Retain the dated candidate baseline: **Next.js 16.3.1, React 19.2.8, Tailwind CSS 4.3.3 and Playwright 1.62.1** from [dependency evaluation](../dependency-evaluation.md). These are researched candidates, not installed dashboard dependencies. Research here was checked on 2026-09-14; current framework documentation may describe patches newer than the requested 2026-08-14 cutoff. Review security fixes and actual hosting compatibility before implementation/deployment without silently changing the recorded baseline.

The existing [SettingsService](../../packages/core/src/settings.ts) shares prefix/module validation, manager authorization, a bounded five-second cache and repository revision checks. The [operator CLI](../../apps/cli/src/cli.ts) calls that service with a trusted local actor. Neither provides web identity, CSRF protection, current Discord membership verification or caller-displayed revision preconditions. A browser must not inherit the CLI's trust model.

## Problem and decision drivers

Guild managers need a consistent interface to configuration, health and audit evidence. Players need separately authorized personal economy/collection workflows. Operators need global controls that guild managers cannot acquire by changing a URL. Each surface has different authority even when it uses the same application.

The web process must support reversible local settings changes and potentially slow external operations without making a render, browser retry or websocket message a new business transaction. Authorization, data projection, persistence concurrency, external effect completion and user feedback require separate contracts. A TypeScript monorepo reduces duplicated definitions; it cannot guarantee zero schema drift, prevent sensitive serialization or prove a user may access a row.

## Alternatives and proposed selection

| Alternative | Useful properties | Cost or rejection reason |
|---|---|---|
| Discord/CLI only | Small deployed surface; keeps existing settings path | Cannot satisfy visual workflows, discovery, accessible bulk configuration or required dashboard |
| Static SPA plus independent API | Clear network boundary; static hosting possible | Adds API deployment/contracts and client orchestration; acceptable if hosting later demands it, but not necessary initially |
| Add dashboard handlers to the bot process | Can access live bot state without another service | Couples browser load, deployments and security failures to gateway/voice lifecycle; rejected |
| Next.js App Router with server application adapters | Fits required framework direction, server-rendered navigation and shared services | Requires a Node web process, framework security maintenance and careful server/client data boundaries; proposed |
| Separate full business backend behind every web request | Strong process separation and multi-client API reuse | Adds authentication/service operations before a second independent client needs that boundary; retain as extraction option |

Propose `apps/web` as a separate Node application with a server composition root. It shares application services with CLI/bot and obtains repositories through the reviewed database adapter. It does not import `apps/bot`, start a gateway client, reach into a voice queue's memory or duplicate domain transitions in route handlers. Cross-process operational actions use durable commands/jobs and scoped read models. Web restarts therefore do not own the survival of a game, provider request or moderation operation.

Use Server Components for authorized reads/navigation and small Client Components for interactive forms, tables and filters. Prefer same-origin Route Handlers for a stable typed request/result contract; a Server Action can be a thin form adapter to the same application boundary. Neither is a trusted private function merely because its source runs on the server. Next's official guidance requires authorization in Server Actions and Route Handlers, not just an enclosing layout or hidden controls. [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication).

## Code and data boundaries

| Layer | May receive/import | Must not receive/import |
|---|---|---|
| Browser component | Explicit public DTOs, safe validation schemas, display/capability metadata, draft input | Database clients/models, session/token records, bot/provider credentials, full server config or executable module registry |
| Server read adapter | Verified session, authorized scope, query service, DTO projector | Arbitrary client permission flags or unbounded repository object serialization |
| Server mutation adapter | Authenticated actor, CSRF/origin evidence, strict operation schema, expected revision and request identity | CLI actor factory, client-supplied owner/role assertions, direct domain-table writes |
| Shared application service | Typed actor and operation, domain policy, repository transaction interface | Browser session implementation or Next response objects |
| Worker/provider edge | Authorized durable intent, scoped credential reference and effect policy | Browser cookie or open-ended command/script from a form |

Propose separate safe schema/DTO exports so importing a validator cannot transitively pull environment loading, a Drizzle driver or a provider client into the browser. Keep server composition and credential helpers explicitly server-only, with dependency/import checks. Next documents a `server-only` marker that produces a build error for a Client Component import; use it as one guard alongside bundle/output inspection. [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components).

Project allowlisted fields rather than spreading a database row into props. A guild settings DTO may contain guild ID, revision, editable nonsecret fields, available module IDs and computed UI capabilities. Capabilities explain permitted controls; the server recomputes authority on submit. Credentials expose only configured state, provider identity, permitted health metadata and safe timestamps; the vault's storage/reference format is not a public API. [ADR-011](ADR-011-secrets-management-and-credential-security.md) owns credential lifecycle.

Treat HTML, React Server Component payloads, JSON, errors, exports, source maps and diagnostic events as separate output surfaces to inspect. A value kept out of the JavaScript bundle can still leak through serialized props or an exception. Never expose decrypted secrets through `NEXT_PUBLIC_` settings, prefilled forms, analytics, clipboard defaults or log download.

## OAuth and session architecture

Propose the server-side authorization-code flow. Request `identify` and `guilds` for login and server discovery; additional scopes need a documented feature justification. Basic guild listings do not supply full role/member context: select a reviewed bot-side member lookup or the separately authorized `guilds.members.read` flow when that context is required. Discord documents `identify` for basic identity and `guilds` for basic guild listings. Login is separate from inviting/installing the bot; a browser-selected guild is only a navigation hint. Bind the callback with a unique, short-lived, single-use state value and exact registered redirect URI. [Discord OAuth2 documentation](https://docs.discord.com/developers/topics/oauth2).

The application-specific flow is:

1. Begin login by creating a server-held pending transaction bound to the browser, intended internal destination and expiration. Permit only local allowlisted return paths; reject scheme-relative or external redirects.
2. On callback validate the transaction, state, expiry and expected issuer/application before token exchange. Reject replay, missing state and denied authorization without creating a session. Callback codes and tokens are redacted from proxy/application logs and removed from the visible URL after processing.
3. Exchange the code server-side, validate returned scopes and fetch the authenticated identity. Create a fresh session identifier; never promote an attacker-chosen pre-login identifier. PKCE support and the chosen client library must be verified with Discord before release; do not claim this document tested a live OAuth client.
4. Keep OAuth access/refresh tokens in protected server storage, separate from the browser cookie. Serialize refresh per credential generation; stale refresh completion cannot overwrite a newer token/revocation. Invalid grants terminate the affected login or require reauthentication rather than looping.
5. Logout invalidates the server session and clears the cookie. Account-wide revoke invalidates all applicable sessions and credentials according to explicit scope; deleting one cookie is not account-wide revocation.

The security review must include code interception/injection, redirect validation and PKCE behavior against the selected provider/library. These are release checks informed by the [OAuth security best current practice](https://www.rfc-editor.org/rfc/rfc9700.html), not claims that all provider features were verified.

Choose an **opaque random session identifier with server-side session state** as the proposed starting model. Store a one-way lookup representation, user identity, creation/expiry/revocation state and credential reference; cookies contain no Discord token or durable permission snapshot. A signed JWT is not encrypted, and encrypted self-contained cookies still need a revocation/rotation strategy. Stateless sessions reduce database reads but complicate immediate session invalidation; that tradeoff is unnecessary for an administrative first release. Select a maintained session/OAuth library after reviewing its exact version, storage adapter and framework integration; neither `iron-session` nor JWT is accepted by name alone.

Candidate session bounds are a 30-minute idle window and 12-hour absolute lifetime, with explicit reauthentication for credential replacement, exports and global administration. These are proposed product/security values, to be reconciled with the main workflow policy before implementation. Server time governs expiration; session renewal cannot extend absolute expiry. Cookies are Secure, HttpOnly, host-only, Path=/ and SameSite=Lax for the reviewed top-level OAuth redirect flow; deployment tests must verify callback behavior. Do not use a broad parent-domain cookie to work around an incorrect callback origin.

## Authorization and request trace

All protected reads and mutations verify session state and requested scope. Server discovery intersects current user membership, bot presence and operation-specific authority. Guild manager access requires current owner/ManageGuild/Administrator evidence mapped through the shared actor/policy contract. A guild manager cannot change global provider credentials, global energy/supply rules or another player's private ownership. Personal player and player-faction authority are separate from Discord guild administration.

Cached guild lists can improve presentation, but are not authorization. For mutations obtain current membership/permissions/bot presence and relevant channel/role hierarchy when the operation requires it. Parse Discord permission bitfields without lossy floating-point conversion. Do not manufacture ManageGuild from a URL, session display flag, role name or configured bot-owner ID. If verification is unavailable, return an explicit retryable denial/unavailable result; never infer permission from the last successful screen load. External Discord permission and local database state cannot form one atomic transaction; queued work therefore rechecks effect-time policy under the shared operation contract.

Proposed prefix edit trace:

1. GET the authorized settings view and return prefix `!`, revision 12 and permitted module metadata. Projection contains no credential value.
2. Browser sends the intended prefix `?`, displayed expectedRevision 12 and an operation key; it does not send a replacement settings row or actor permissions.
3. Server verifies session, CSRF/origin, fresh guild authority and strict input; shared service compares the caller precondition and commits settings plus audit/receipt atomically.
4. If another writer reached revision 13, return a conflict with permitted current values. Preserve the draft, show changed fields and require deliberate reapplication. No automatic whole-form retry.
5. If accepted, return the committed revision/receipt. Invalidate the affected read model locally; other processes follow their documented cache/freshness contract. Lost response is resolved by receipt/current-state lookup, not a second blind mutation.

**Prerequisite gap:** current methods are `setPrefix(actor, prefix)` and `setModule(actor, moduleId, enabled)`; neither accepts a caller revision or durable operation key. Repository CAS protects simultaneous persistence, but a later stale form can be applied after the service freshly reads a newer row. Extend the shared service before exposing edits; do not bypass it from a web route. [ADR-013](ADR-013-configuration-permissions-and-concurrency.md) owns the detailed race and cache contract.

## CSRF, caching and asynchronous completion

Propose same-origin state-changing requests with session-bound CSRF evidence and strict Origin validation, using a fixed trusted external origin behind the proxy. Reject missing/foreign origin according to a tested transport policy; do not trust arbitrary forwarded host headers. GET/render/prefetch paths must not mutate settings or launch provider work. Cookie flags and CORS are supporting controls, not proof of user intent. Protect OAuth state independently from ordinary form CSRF.

Protected HTML/data responses start with a private no-store policy; shared CDN/public caches receive only explicitly public assets/content. Request-local authorization memoization may avoid duplicate checks within one render, but cannot become cross-user permission caching. Any later data cache key includes tenant, actor/visibility class, query and version where relevant, with tested invalidation and revocation behavior. Do not infer isolation from a framework's current cache default. Clear scoped browser query state on logout, account or guild switch; stale responses must not repopulate the new scope. Avoid persisting sensitive drafts in localStorage.

For a local settings write, committed means the database transaction succeeded. For an integration test, image render, export or moderation effect, accepted means a durable operation exists, not that the external effect finished. Return an opaque operation ID plus typed state and safe follow-up URL. The [adapter contract](../adapters.md) distinguishes `accepted`, `completed`, `failed` and `unknown` provider outcomes; a browser timeout must not create a new paid request. Status reads authorize the operation owner/scope again and never expose another user's result through guessed IDs.

Start with bounded polling for job/provider/health updates: candidate 15–30-second visible-tab intervals, jitter, exponential backoff on transient failures, stop on terminal state and pause when hidden. Show last-updated time and stale/unavailable state. Polling is easier to operate and validate than persistent connections for mostly administrative traffic; it is not suitable for high-frequency audio/game control. Those controls still submit versioned commands through domain services.

Evaluate SSE only after measured update latency or polling load justifies it. SSE needs authenticated subscription scope, bounded replay cursor, per-user connection limits, heartbeat/proxy timeout behavior, backpressure and periodic session/permission revalidation. Revoked sessions must close streams; reconnect cannot replay unauthorized history. Events are hints to refresh an authorized view, not proof that a command committed. WebSocket bidirectional transport is a separate justified decision, not required merely to label a dashboard realtime.

## Usability, operation and rollout consequences

Dark-first anime styling is a candidate presentation direction, not a reason to make configuration difficult to read. Support system/light preference, keyboard navigation, visible focus, labels/error association, sufficient contrast, reduced motion and narrow screens. Configuration groups need clear inherited/current/draft values, save/cancel states and accessible conflict summaries. A provider outage or unimplemented module must have an honest state; decorative success cards cannot replace service evidence.

The dashboard adds a deployable process, OAuth callback registration, session storage, connection-pool budget and browser security patch surface. Readiness checks validate its required database/session dependencies without revealing secrets. Public health is minimal; guild and operator diagnostics are separately authorized. Record request/operation correlation, authorization failures, OAuth callback outcomes, mutation conflicts, latency and polling pressure with bounded retention and redaction. An outage in optional integration health must not erase locally committed settings.

Roll out login/discovery and read-only views first, then the caller-revision/receipt contract and one authorized settings form, then additional capability-backed workflows. Each slice follows the existing work board; this ADR does not authorize a new implementation ticket. Use additive compatible contracts and disable a defective module without disabling login/recovery. Preserve a tested operator recovery path before exposing command policies that can lock out administrators.

Rollback web code only to a version compatible with current schema, sessions and shared services. Disabling a web route does not undo provider actions, published Discord messages or ledger writes. Cancel/reconcile durable work by its domain policy; use compensations for committed effects. A session-format/key change needs rotation overlap or intentional reauthentication, not accidental acceptance of obsolete credentials. Retain compatible bot/CLI behavior while the web artifact is replaced.

## Acceptance and reconsideration gates

| Area | Required evidence before release |
|---|---|
| OAuth/session | Correct login/callback/logout; denied consent; state/code replay; wrong redirect; expiry/fixation; token refresh race; revoke across two web instances |
| Authority | Forged guild/player ID; cached membership after revoke; bot removed; manager versus operator/faction owner; denied direct Server Action/Route Handler call |
| CSRF/output | Foreign/missing-origin policy, cross-site form, sensitive GET rejection, redacted callback/error logs, browser bundle/RSC/JSON/export inspection |
| Isolation | Two users and two guilds through browser/CDN/server caches; logout/account switch with in-flight requests; unauthorized job/status cursor |
| Concurrency | Two displayed revision-12 forms; CLI edit between view/save; duplicate request key; same key/different payload; commit-success/response-loss |
| External work | Accepted versus completed UI, paid outcome unknown, worker restart, permission revoked before effect, duplicate status delivery |
| UX | Keyboard/screen-reader forms, focus after validation/conflict, responsive layout, reduced motion, empty/loading/stale/unavailable states |
| Operations | Multi-process session invalidation, dependency outage, pool bounds, proxy/cookie configuration, compatible deployment rollback |

No existing foundation test proves these browser behaviors. Run unit contracts, real database concurrency and Playwright browser scenarios on the actual web implementation; authorized Discord OAuth smoke tests remain a separate credentialed gate.

Revisit this decision when hosting cannot support the required Node/session model, independent API consumers need a stable external backend, measured polling pressure warrants SSE, or desired revocation latency exceeds the session/permission strategy. Revisit schema sharing if client exports acquire server dependencies. Framework or session-library adoption must pass the same gates; neither changes the authority model or eliminates mixed-version deployment risk.
