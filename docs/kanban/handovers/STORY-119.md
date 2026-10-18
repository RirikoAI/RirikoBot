# Handover Notes: STORY-119 Chrome Device Bound Session Credentials (DBSC) for Dashboard Sessions

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-04T09:00:00Z · Claude Code (Opus 5.5)

**Support check (the precondition for grooming)**
- DBSC is generally available in Chrome 146 on Windows (April 2026), with keys held in the TPM. macOS support (Secure Enclave) is announced but not shipped.
- The protocol is a W3C Working Draft (webappsec-dbsc). Sources: https://developer.chrome.com/docs/web-platform/device-bound-session-credentials, https://developer.chrome.com/blog/dbsc-windows-announcement, https://w3c.github.io/webappsec-dbsc/
- Other browsers ignore the headers, so they keep today's behavior.

**Approach**
1. TASK-1191 builds the protocol core: columns, proof verification, sealed challenges, the bound cookie and the `SessionService` methods.
2. TASK-1192 exposes it: register and refresh route handlers, the registration header at sign-in, bound cookie enforcement in `getSession`, a sessions-page badge, and the docs.

**Design**
- **Registration.** The Discord callback response carries `Secure-Session-Registration: (ES256 RS256);path="/api/auth/dbsc/register";challenge="<sealed>"`.
- **Register.** The browser posts a `dbsc+jwt` proof with its public key (`jwk` header) and `jti` = the challenge.
  - The server verifies it, then stores a random `dbsc_session_id` and the JWK on the `web_sessions` row.
  - It rotates the session ID (a cookie copied before binding becomes worthless).
  - It sets `__Host-ririko_bound` and returns the session instructions JSON.
- **Bound cookie.** `__Host-ririko_bound` is a vault-sealed `{sid, exp}` that lasts 10 minutes. It is stateless: no database write per refresh, and no race between tabs.
- **Refresh.** `POST /api/auth/dbsc/refresh` answers 403 with `Secure-Session-Challenge: "<sealed>";id="<sid>"`. When the proof is signed by the stored key, it answers 200 with a new bound cookie. For an unknown or ended session it answers 404, and the browser ends its DBSC session.
- **Challenges.** A challenge is vault-sealed `{sid, exp}`, valid for 2 minutes, so no challenge columns are needed.
  - Tradeoff: a proof can be replayed within those 2 minutes, but only by someone who captured the proof itself. That attacker already holds the bound cookie, which is the same exposure as DBSC accepts by design.
- **Enforcement.** A row with `dbsc_session_id` resolves only with a valid bound cookie for that sid. A bound session cannot be downgraded. Unbound rows behave as before.
- **Crypto.** Use `node:crypto` only: `createPublicKey({ key: jwk, format: 'jwk' })` and `verify`, with `dsaEncoding: 'ieee-p1363'` for ES256. No new dependency.

**Relevant code** (from CodeGraph during grooming)
- `apps/web/src/lib/server/auth/session-service.ts:95` `SessionService.resolve`: the enforcement point.
- `apps/web/src/lib/server/auth/session-service.ts:168` `SessionService.completePasskeyCheck`: the ID rotation to reuse.
- `apps/web/src/lib/server/auth/oauth-state.ts:21` `sealPendingLogin`: the vault-sealed cookie pattern.
- `apps/web/src/lib/server/auth/session.ts:11,14,31` `SESSION_COOKIE`, `BASE_COOKIE`, `getSession`.
- `apps/web/src/app/api/auth/callback/route.ts:16` `GET`: where the session is created at sign-in.
- `apps/web/src/app/api/auth/logout/route.ts:8` `POST`: where logout clears cookies.
- `packages/database/src/schema/{sqlite,pg}/web.ts` `webSessions`, and `packages/database/src/repositories/web-session.repository.ts`.
- `apps/web/src/lib/server/authorization-coverage.test.ts`: the auth-route allowlist.

**Pitfalls**
- `completePasskeyCheck` renames the row ID. The DBSC columns travel with the row, and `dbsc_session_id` is separate from the row ID.
- Schema changes need `db:generate-ddl`, and the user must run `pnpm db:push` on the dev database.
- DBSC only applies over HTTPS. A real-browser check needs Chrome 146+ on Windows.

**Out of scope**
- Binding sessions that existed before this ships. They expire within 12 hours.
- Making DBSC mandatory. Requiring specific browsers.

---

## REVIEW · 2026-10-04T09:32:00Z · Claude Code (Opus 5.5) · DONE

**Outcome**
- TASK-1191 (protocol core) and TASK-1192 (routes, wiring, badge, docs) are DONE.
- With DBSC (Chrome 146+ on Windows), the session is bound to a TPM key at sign-in, and its ID rotates at binding. A copied session cookie without a fresh 10-minute bound cookie no longer resolves. Other browsers are unchanged.
- Story gate passes: lint, typecheck, `test:coverage` with all thresholds, and build.

**Follow-ups for the user**
- Run `pnpm db:push` on the dev database (new `web_sessions.dbsc_session_id` and `dbsc_public_key` columns and a unique index). `next dev` fails until it runs.
- A real-browser check is not done. It needs Chrome 146+ on Windows over HTTPS, signing in, and then watching `/api/auth/dbsc/register` and `/api/auth/dbsc/refresh` in DevTools.
- Groomer note: TASK-1191's first `verify_cmd` ran vitest from `apps/web`, outside the root config. Groom web test commands from the repository root.
