# Handover Notes: STORY-176 Harden the Production Compose for a Tunnelled Host

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-04T18:50:17Z · Claude Code (Opus 5.5)

**Approach**
- TASK-1761 changes only `docker-compose.production.yml`, its env example and docs, plus a parsing test.
- TASK-1762 changes how the dashboard reads the client IP.
- The two tasks are independent; run them in order.

**Relevant code**
- `docker-compose.production.yml`: `web` publishes `'${DASHBOARD_PORT:-3000}:3000'` on every interface today.
- `apps/web/src/lib/server/auth/request.ts:28` `clientIp`: first X-Forwarded-For entry. It keys `rateLimits.auth`, `rateLimits.probes` and pre-sign-in `rateLimits.actions` (`apps/web/src/lib/server/rate-limit.ts:75,84`, `apps/web/src/lib/server/request-context.ts:22`).

**Out of scope**
- Caddy or any reverse proxy in the compose file; cloudflared runs on the host (TASK-1771).

---

## REVIEW · 2026-10-04T19:26:43Z · Claude Code (Opus 5.5) · DONE

- TASK-1761 and TASK-1762 are DONE and reviewed. The story verify_cmd parts pass: compose `config -q` (PowerShell), the `scripts`, `apps/web/src/lib/server` and `packages/core/src/config` vitest runs, typecheck, lint and format.
- Follow-up for TASK-1772: `.env.production` on the tunnelled hosts sets `CLIENT_IP_HEADER=cf-connecting-ip` (already in its acceptance).
