# Contributing & Development Standards (Ririko AI 2.0.0)

## 1. Overview & Culture
Welcome to the Ririko AI 2.0.0 engineering team! We operate like a senior open-source project prioritizing:
- **Clarity over Cleverness**: Boring, readable, explicit code is always preferred over dense "magical" abstractions.
- **Typed Contracts**: Every boundary (API, database, Discord event, command argument) must be strictly typed.
- **Zero Regressions**: Feature additions must never degrade legacy feature parity or corrupt historical data.

---

## 2. Engineering Workflow (Section 87)
For any significant task or feature implementation:
1. **Inspect**: Read relevant legacy code, documentation, and dependencies.
2. **Design**: Confirm interfaces and document architectural decisions in an Architecture Decision Record (`docs/archive/adr/`) if a significant choice is made.
3. **Scaffold**: Copy the layout of a nearby command or module. [architecture.md](architecture.md) shows where each part lives. The command-line tool has no scaffolding commands. [development.md](development.md) lists the real ones.
4. **Implement**: Write domain services first, followed by Discord command glue and database queries.
5. **Test**: Author unit tests with deterministic random seeds and integration tests.
6. **Verify Quality Gate**:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test:coverage
   pnpm build
   ```
   **Coverage is a merge gate**: a PR is not merged unless every coverage threshold in `vitest.config.ts` passes (see [testing.md §4.1](testing.md#41-coverage)).
7. **Schema changes ship a migration**: if you changed a Drizzle schema (`packages/database/src/schema/`), run `pnpm db:generate`, review the SQL for both dialects and commit `packages/database/migrations/` together with the embedded modules and the DDL files (see [database.md](database.md#13-change-the-schema)).
   - Never edit a migration after it has been released.
   - A destructive change (`DROP TABLE`, `DROP COLUMN`, a rename, a column type change, `SET NOT NULL`) follows expand/contract: ship the additive step first, and do the destructive step in a later migration whose first line is `-- ririko:contract`, once no release still uses the old shape.
   - `pnpm db:push` is a development shortcut. It never runs against staging or production.
   - Run `pnpm db:check` before you push. It is what the CircleCI `lint` job runs: it fails when a schema change has no migration, when the embedded modules are stale, or when a migration has an unmarked destructive statement.

---

## 3. Decision-Making Principles (Section 88)
- If multiple technically valid implementation options exist, make the best engineering choice based on performance, maintainability, and security.
- Document the decision and trade-offs in an ADR.
- Only pause for user or maintainer feedback on decisions that materially affect product direction, user privacy/security, irreversible data migration, or major infrastructure costs.

---

## 4. Git & Commit Guidelines
- **Main Development Branch**: `develop/2.0.0` is our main development branch for the entire 2.0.0 development lifecycle. All feature branches, subsystem PRs, and architectural docs must branch from and target `develop/2.0.0`.
- Use conventional commits:
  - `feat(tcg): implement 8-tier card drop generator`
  - `fix(music): clamp volume requests to 150%`
  - `refactor(economy): migrate to double-entry ledger`
  - `docs(adr): add ADR-013 for image caching`
- Keep pull requests focused on a single module or subsystem.

## 5. Documentation Site
- The documentation in `docs/` is also the project wiki, a Docusaurus site in `website/`. Edit the Markdown files in `docs/`; the site reads them directly and nothing is copied.
- Run it locally with `pnpm docs:dev`. It opens at <http://localhost:3000>, or the next free port, and reloads as you edit.
- To check the finished site, run `pnpm docs:build` and then `pnpm docs:serve`. The built site and its search work offline.
- `pnpm docs:build` fails on any broken link or anchor, and CircleCI runs it. Link to files outside `docs/` (for example `SETUP.md`) with a full GitHub URL.
- `docs/kanban/`, `docs/archive/` and `docs/hosting.md` are not part of the site.
- The landing page is `website/src/pages/index.tsx`. The command reference at `/commands` is generated: `pnpm docs:commands` (run first by `docs:dev` and `docs:build`) writes `website/src/data/commands.json` from the real command definitions with `scripts/export-commands.ts`. It needs the workspace built (`pnpm build`), no token and no network. Never edit or commit that file.
