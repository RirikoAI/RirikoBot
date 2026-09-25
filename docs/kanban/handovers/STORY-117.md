# Handover Note: STORY-117 Passkey Sign-In Gate, Step-Up Re-Verification & Owner Guard

- **Ticket Type & Points**: Story | 5 pts (`TASK-1171` = 3, `TASK-1174` = 2)
- **Epic**: `EPIC-011`
- **Author / Agent**: Claude Code (Opus 5.5)
- **Status**: REVIEW
- **Timestamp**: 2026-09-25
- **Branch**: `feat/STORY-117-passkeys` (targets `develop/2.0.0`)
- **Decisions**: [ADR-013, revision 2026-09-25](file:///Z:/Projects/ririko-v2-2026/docs/adr/ADR-013-dashboard-sessions-and-credential-theft-defense.md)

## 1. Summary of Work Accomplished

### TASK-1171: Passkeys, sign-in gate, step-up
- **Library:** `@simplewebauthn/server` and `@simplewebauthn/browser` 14.x (recorded in [dependency-evaluation.md §2.7.1](file:///Z:/Projects/ririko-v2-2026/docs/dependency-evaluation.md)).
- **Schema:**
  - New dual-dialect `web_passkeys` table ([sqlite](file:///Z:/Projects/ririko-v2-2026/packages/database/src/schema/sqlite/web.ts), [pg](file:///Z:/Projects/ririko-v2-2026/packages/database/src/schema/pg/web.ts)): credential ID, user, name, COSE public key, counter, transports, `device_type`, `backed_up`, created and last-used times. Only public keys are stored.
  - `web_sessions` gains `webauthn_challenge` and `webauthn_challenge_expires_at`.
- **Repositories:**
  - [WebPasskeyRepository](file:///Z:/Projects/ririko-v2-2026/packages/database/src/repositories/web-passkey.repository.ts): create, find (scoped to the user), list, count, record use, delete.
  - `WebSessionRepository` gains a generic `update` (also used to rotate the row ID) and `consumeChallenge`.
- **Single-use challenges:** `consumeChallenge` is one conditional update, so a challenge works once and within 5 minutes.
- [passkeys.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/passkeys.ts) (`PasskeyService`):
  - Registration and authentication options and verification.
  - The user handle is `sha256("ririko-web:<id>")`, so the Discord ID is not exposed to the authenticator.
  - Browser responses are validated with Zod before verification.
  - Any verification failure becomes a `PasskeyVerificationError`. This includes a signature counter that did not increase.
  - Add and remove write audit entries (`web.passkey.add` and `web.passkey.remove`).
- [passkey-policy.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/passkey-policy.ts):
  - `needsPasskeyCheck` is the sign-in gate.
  - `stepUpState` requires a passkey check within 5 minutes.
  - `enrollmentState`: adding another passkey needs a fresh check. The first passkey needs a Discord sign-in from the last 10 minutes, so an older stolen cookie cannot enroll the thief's passkey and lock the owner out.
- `SessionService`:
  - `storeChallenge` and `consumeChallenge`.
  - `completePasskeyCheck` records `step_up_at` and rotates the session ID. It re-encrypts the Discord tokens under the new ID and first waits for any token refresh already in progress.
- [session.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/auth/session.ts):
  - `requireSession` now enforces the gate by redirecting to `/verify?returnTo=`. Every existing page and settings action inherits it through `requireGuildAccess`.
  - `requireSessionForPasskeyCheck` (verify flow only), `requireStepUp`, `getPasskeyCount` (cached per request) and `writeSessionCookie`.
- **Pages and actions:**
  - [/verify](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/verify/page.tsx) and its [actions](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/verify/actions.ts) serve both the sign-in gate and step-up.
  - [/account/security](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/account/security/page.tsx) and its [actions](file:///Z:/Projects/ririko-v2-2026/apps/web/src/app/account/security/actions.ts) list, add and remove passkeys.
  - The client `PasskeyManager` retries automatically after a passkey check. A "Security" link is added to the user menu.
- [request-context.ts](file:///Z:/Projects/ririko-v2-2026/apps/web/src/lib/server/request-context.ts): shared `isDashboardRequest` Origin check and `requestActor` (IP, user agent). `saveGuildSettings` now uses them.

### TASK-1174: Owner guard and recovery
- **`BOT_OWNER_ID`** is added to the core config schema as a comma-separated list of Discord IDs, parsed to `string[]` and validated.
  - `.env.example` no longer ships the `your_discord_user_id` placeholder, which the dashboard would now reject.
  - The bot is unchanged: its permission middleware is not wired and no command is owner-only.
- **`requireOwner(returnTo)`:**
  - Non-owners get a 404.
  - Owners without a passkey are sent to `/account/security`.
  - A stale passkey check sends them to `/verify`.
  - No page uses it yet; the owner console comes in STORY-112 and STORY-115.
- [ririko passkeys:reset <user_id>](file:///Z:/Projects/ririko-v2-2026/apps/cli/src/commands/passkeys-reset.ts):
  - Without `--yes` it only reports the number of passkeys.
  - With `--yes` it deletes the user's passkeys and sessions in one transaction and audits `web.passkey.reset` with the `cli:<os user>` actor.

## 2. Current State & Verification
- `pnpm build`, `pnpm typecheck`, `pnpm lint` (0 errors) and `pnpm build:web` all pass.
- `pnpm test`: 192 files, 1744 tests.
- **New tests:**
  - `passkeys.test.ts` (13) runs real WebAuthn verification through a software authenticator (`testing/soft-authenticator.ts`, P-256, "none" attestation, ES256 assertions). It covers registration, device flags, challenge reuse and expiry, phishing origin, missing user verification, counter rollback, foreign credentials, removal and session rotation.
  - Policy tests and guard tests: sign-in gate, removal step-up, Origin, owner guard.
  - Config test for `BOT_OWNER_ID`.
  - CLI reset test (3).
- **Dry run of `drizzle-kit push`** against a copy of the dev database. It applied only additive statements: `CREATE TABLE web_passkeys` with its index, and two `ALTER TABLE web_sessions ADD` columns.
- **`next start` smoke test** against that copy, with a session row inserted directly:
  - No passkey: `/account/security` returns 200.
  - After adding a passkey row: `/account/security` and `/servers` redirect to `/verify?returnTo=…`, and `/verify` returns 200.
  - After setting `step_up_at`: the security page lists the passkey, and `/verify` redirects back.
- **Not verified:** a real browser passkey ceremony (Windows Hello, a phone or a security key). This needs a user at the machine; see the next steps.

## 3. Roadblocks, Gotchas & Decisions Made
- **Challenges are stored on the session row, not in a sealed cookie** as the grooming note said. The server can then enforce single use with one conditional `UPDATE`, which a cookie cannot do.
- **The first passkey needs a Discord sign-in from the last 10 minutes.** This rule was added during implementation to stop a thief holding a stolen cookie from enrolling their own passkey and locking the real user out. The UI links to "Sign in again".
- **`/verify` serves both the sign-in gate and step-up.** It shows the prompt whenever the session's check is missing or older than 5 minutes, and redirects back otherwise.
- **`requireOwner` uses redirects.** STORY-112 and STORY-115 may want an action variant that returns the "passkey check required" result so `withPasskeyCheck` can retry without leaving the form.
- **New-device DMs, passkey-removal DMs, the sessions page, CSP, rate limits and the guard coverage test are STORY-118.** Until then, passkey changes are recorded only in `audit_logs`.
- **Vitest root config** now maps `@/` to `apps/web/src`, so web tests can import app modules.
- **Smoke-test harness on Windows:** Git Bash strips backslashes from paths passed into `DATABASE_URL`, so use forward-slash paths (`cygpath -m`).

## 4. Actionable Next Steps for Next Session / Continuing Agent
1. Run `pnpm db:push` on the dev database to create `web_passkeys` and the two `web_sessions` columns.
2. Manual check with `pnpm dev:web`:
   1. Sign in and open Security. Add a passkey with Windows Hello or a phone.
   2. Sign out and in again: `/verify` should ask for the passkey before `/servers` opens.
   3. Remove the passkey after 5 or more minutes: you should be asked to confirm with it first.
3. Try `pnpm cli passkeys:reset <your_id>` without `--yes`, then with it.
4. Open the STORY-117 PR against `develop/2.0.0` after user review. Next is STORY-118.
