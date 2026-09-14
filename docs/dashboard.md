# Dashboard design — pending implementation
The dashboard will live in apps/web with Next.js/React versions from dependency-evaluation.md. No dashboard, OAuth login or browser E2E is present in the foundation.

Use Discord identify/guilds scope as appropriate, state-bound OAuth callbacks, server-held tokens, opaque expiring sessions and secure HttpOnly SameSite cookies. Revalidate bot presence and user owner/ManageGuild permissions for each guild mutation. A guild ID in a URL is not authorization. CSRF/origin checks apply to writes. Avoid putting privileged data or tokens into client components.

Reuse core settings schemas and application services for prefix/module/command controls. Future module forms derive from typed schemas and capabilities; hide unavailable providers/features. Include audit/settings conflicts, health and aggregate usage without exposing credentials. Each module remains incomplete until its required controls and authorization/E2E tests exist.

