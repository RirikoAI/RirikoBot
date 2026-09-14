# ADR-008: Authorized web dashboard

## Status

Proposed future application. A working Next.js dashboard, OAuth flow, browser sessions and protected admin API have not been implemented.

## Problem

The legacy snapshot contains one `public/index.html` file and informational Nest HTTP controllers, not an authenticated administration dashboard. Server settings must be manageable without duplicating command authorization or trusting a submitted guild ID. Economy/TCG views must reflect real services when those services exist.

## Options considered

- Keep configuration only in Discord and the operator CLI.
- Build a separate SPA/API with duplicated validation and service contracts.
- Use Next.js App Router in the monorepo with server-only service access and shared schemas.

## Decision proposed

Use **Next.js 16 / React 19** as the researched dashboard direction, with versions and current security fixes reviewed before implementation/deployment. Build server-rendered/admin workflows in `apps/web`; share domain validation and service interfaces rather than importing database drivers or bot secrets into browser bundles.

Use Discord OAuth2 with the minimum required identity/guild scopes, checked authorization state, server-held credentials and opaque expiring sessions. Cookies require Secure/HttpOnly/SameSite configuration appropriate to deployment. Validate origin/CSRF for mutations, protect callback/redirect handling and revoke/expire sessions. Select and review the session implementation instead of treating JWT and encrypted cookies as interchangeable defaults.

Authorize every protected server operation using current guild membership/permissions and the shared settings service. Revalidate sensitive operations; cached guild lists are presentation data, not authorization. Only expose installed modules/features. Render masked credential status and shared configuration forms; never return secret values to the browser. Provide accessible responsive layouts and clear empty/error/loading states.

## Consequences

A second process and OAuth/session lifecycle add deployment and security work. Shared schemas reduce duplication but do not eliminate drift or replace runtime validation. User dashboards for collections, marketplace and economy depend on those services being implemented first. Framework choice alone does not establish security or feature completeness.

## Validation and evidence

Require browser tests for login/callback/logout, invalid state, expired sessions, CSRF/origin rejection, unauthorized guild selection, revoked permissions, concurrent settings changes and responsive/accessibility behavior. Verify server/browser bundle boundaries and live Discord OAuth separately. See [architecture](../architecture.md), [dependency candidates](../dependency-evaluation.md), and [shared configuration decision](ADR-013-configuration-permissions-and-concurrency.md).
