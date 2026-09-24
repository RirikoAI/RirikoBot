# ADR-013: Dashboard Sessions and Credential Theft Defense

## Status
Accepted (2026-09-24, EPIC-011 grooming). Amends decision 2 of [ADR-008](ADR-008-web-dashboard-architecture.md).

## Context
ADR-008 left the dashboard session format open ("`iron-session` or standard JWT"). During EPIC-011 grooming, two questions were raised:

1. Should the dashboard use JWKS and JWE so each request is secured by a verifiable, encrypted token?
2. How can the dashboard be hardened so that stolen credentials cannot be used?

The dashboard is a single Next.js application that both issues and verifies its own sessions. The realistic credential threats are:

- Session cookie theft through XSS or infostealer malware that copies the browser profile.
- A compromised Discord account used to log in through OAuth2.
- A leaked database dump or backup.
- Tampering with the `guildId` in a request to reach a guild the user does not manage (IDOR).
- Cross-site request forgery.
- Secrets (bot token, provider API keys, Discord OAuth tokens) leaking into client components.

No design can make a stolen credential impossible. The goal is that a stolen credential is short-lived, revocable, unable to perform sensitive writes without a second factor, and visible to its owner.

## Decision
1. **Opaque server-side sessions, not self-contained tokens.**
   - The `__Host-` session cookie (HttpOnly, Secure, SameSite=Lax, Path=/) holds 32 random bytes.
   - The dual-dialect `web_sessions` table stores only the SHA-256 hash of that ID, so a database leak does not yield usable cookies.
   - Discord access and refresh tokens are stored in the session row, encrypted with AES-256-GCM under a versioned key from the environment (see [ADR-011](ADR-011-secrets-management-and-credential-security.md)). They never reach client components.
   - Sessions expire after 30 minutes idle or 12 hours absolute. The session ID rotates on login and on step-up.
   - Logout, per-session revoke and "sign out everywhere" take effect on the next request.
2. **JWKS rejected.** JWKS publishes public keys so that many independent verifiers can check tokens from one issuer. The dashboard is its own only verifier, so JWKS would add key rotation infrastructure with no consumer. Revisit only if a separate service must verify dashboard-issued tokens.
3. **JWE (or any sealed cookie token) rejected as the session.** A self-contained token cannot be revoked: a stolen token stays valid until it expires, and logout does not invalidate it.
4. **Browser-side per-request signing rejected.** A DPoP-style key kept in IndexedDB is copied together with the browser profile by infostealer malware. Only hardware-bound keys resist that. Chrome Device Bound Session Credentials (DBSC) may be added as an optional enhancement where the browser supports it.
5. **Passkey step-up for sensitive writes.**
   - Users can enroll WebAuthn passkeys (`web_passkeys` table). Once a user has a passkey, it is always required.
   - Bot owners (`ownerIds`) must enroll a passkey before using the owner console.
   - Sensitive Server Actions require a passkey assertion newer than a short window (`step_up_at` on the session): the owner console, moderation escalation policy, reaction-role publishing, and integrations.
   - A stolen cookie or a compromised Discord account alone cannot pass step-up.
6. **Authorization in the data path, never in middleware.** Every Server Action and route handler calls `requireGuildAccess(guildId)` (or the owner guard). It re-verifies `ManageGuild` (0x20) or `Administrator` (0x8) against a short-TTL cache on every call. Next.js middleware (`proxy.ts`) is never the authorization layer, because CVE-2025-29927 showed it can be bypassed. A test enumerates every Server Action and route handler and fails if one skips the guard.
7. **Least-privilege OAuth2.** Scopes are `identify` and `guilds` only, with a signed `state` parameter (plus PKCE if Discord accepts it for this application type). All mutations use the bot token on the server after the authorization check. A stolen user OAuth token can only read the guild list.
8. **Browser hardening.** Nonce-based CSP without `unsafe-inline`, `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options: nosniff`, a strict `Referrer-Policy` and COOP. No `dangerouslySetInnerHTML`. Origin checks on route handlers. React taint APIs (`experimental_taintUniqueValue`, `experimental_taintObjectReference`) and `server-only` imports guard secrets and tokens. Rate limits on auth routes and Server Actions.
9. **Detection.** The bot DMs a user when they sign in from a new device and posts a notice to the guild log channel when dashboard changes are saved. `audit_logs` records the actor, IP, user agent and field diffs. An active sessions page lists sessions with revoke controls.

## Consequences
### Positive
- Stolen sessions can be revoked immediately and expire quickly.
- Sensitive writes need a second factor that neither a cookie thief nor a Discord account thief has.
- A database leak exposes neither usable session IDs nor readable Discord tokens.
- Unauthorized guild access is blocked in the data path and covered by a test.

### Negative
- One indexed database read per request to resolve the session (a few seconds of in-process caching is acceptable).
- Passkey enrollment adds friction for bot owners and for users who opt in.
- A WebAuthn library dependency must be evaluated in [dependency-evaluation.md](../dependency-evaluation.md).

## Implementation
Tracked in EPIC-011: TASK-1102 (sessions), TASK-1103 (guild authorization guard), and STORY-117 (TASK-1171 passkeys, TASK-1172 session management and alerts, TASK-1173 CSP, taint guards and authorization coverage test). See [docs/dashboard.md](../dashboard.md).
