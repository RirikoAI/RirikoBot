# Ririko AI 2.0.0

Modernize the established Discord bot without silently losing commands, behavior, assets or data. Use the source-backed parity inventory; do not repeat an assumed command count. Legacy source is **`.audit/RirikoBot` (read-only)**. `.local/` is also protected; the older documented `.local/RirikoBot` path is not the checkout used by this audit.

AGENTS.md also loads through .gemini/settings.json. Specialists live in .gemini/agents/. Delegate bounded domain work with explicit file ownership, then review it before integration.

## Shared context

@./docs/architecture.md
@./docs/dependency-evaluation.md
@./docs/implementation-roadmap.md

Before changing a domain, read docs/legacy-feature-inventory.md, its source references and the corresponding specialist file. For data changes, also inspect docs/migration-1.x-to-2.0.md and the actual legacy schema. Distinguish intended architecture from implemented behavior.

## Engineering rules

- Use exact versions and compatibility exceptions from dependency evaluation; pnpm and its lockfile are authoritative. Never install dependencies in the legacy checkout.
- Write strict ESM TypeScript, use unknown at untrusted boundaries and runtime validation; no any casts. Prefer small modules and explicit composition over globals and unnecessary frameworks.
- Isolate Discord/HTTP UI. One application service handles slash and prefix commands; metadata feeds registration, help and dashboard discovery. Preserve audited aliases and arguments.
- Define realistic provider/repository contracts before implementation. Declare capabilities and unavailable configuration explicitly; never return successful placeholders.
- Await or supervise asynchronous work with error boundaries. Bound requests, concurrency, retries and timeouts; dispose timers, collectors, streams and connections.
- Keep secrets in environment configuration or an AES-256-GCM vault; redact logs and browser bundles. Recheck operation authorization and defend remote URL fetches against SSRF.
- Scope AI memory by guild/channel/user, separate personality from system policy, validate tool input and derive actor/guild authority from trusted context.
- Database changes originate in packages/database and require review against its schemas/contracts before consumption. Parameterize SQL, enable SQLite foreign keys and test both dialects.
- Use transactions/idempotency for balances, trades, inventory and jobs. Never mutate legacy source databases; use read-only snapshots and verify counts/totals with explicit invalid-row reports.

## Development workflow

1. **Feature:** link the inventory entry or new requirement; define acceptance behavior, affected package and public contract. Delegate separable work with clear ownership.
2. **Command:** add metadata, slash/prefix parsing, aliases, validation and shared permission/cooldown checks. Call the application service; document and test both invocation forms.
3. **Provider:** implement declared capabilities behind the domain interface. Test success, malformed output, timeout, rate limiting and unavailable credentials; record official sources and verified limits.
4. **Dashboard module:** follow architecture boundaries, shared DTOs and server services. Verify guild authority per request and test authorized/unauthorized flows; no client-side secrets or database clients.
5. **Migration:** inspect source semantics, write dialect-specific SQL and mappings, exercise dry run, retry and verification; document backup/restore and rollback limits.
6. **Tests/docs:** each new command/service needs meaningful Vitest tests. Use deterministic clocks/randomness and external fixtures; opt-in integrations use isolated databases. Update command/config docs with implementation and architecture/ADRs when decisions change.

Use implemented root scripts: pnpm build, pnpm typecheck, pnpm lint and pnpm test. Report missing scripts/failures accurately. Run targeted tests while editing, then required workspace checks. Inspect package.json and CLI help for actual scaffold/doctor/migration commands; planned examples are not proof of availability.

## Release discipline

Track delivered behavior and remaining work in the roadmap. Release gates include build/type/lint/tests, provider/native compatibility, both-dialect migration verification, backup/restore rehearsal, health/shutdown checks and parity review. Update versions, changelog and operator instructions together. Documents and empty package directories do not establish release readiness.

The task authorizes implementation and ordinary verification; do not infer extra approval gates for routine reversible work. Preserve other contributors' changes and stay within assigned scope.
