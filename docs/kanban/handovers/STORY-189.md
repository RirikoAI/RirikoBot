# STORY-189 · Docusaurus Documentation Site on ririko.ai

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-10T20:59:20Z · claude-opus-5-5 (coordinator)

**Decisions**
- **Single source**: Docusaurus reads `../docs`, so the files stay where agents and contributors expect them.
- **Hosting**: GitHub Pages through Actions, on ririko.ai. The domain answers 530 today, so nothing is lost.
- **Vercel status page**: retired. The board is a development artefact. Its URL can redirect to the GitHub repository.

**Maintainer steps**: the Pages settings and the Cloudflare DNS. Disable the wiki after TASK-1894.

---

## GROOMING · 2026-10-10T21:18:21Z · claude-opus-5-5 (coordinator) · maintainer decisions

**Maintainer decisions (2026-10-11)**: the docs site is the wiki for everything users learn. It is served at `ririko.ai/docs`, with the landing page at `ririko.ai`, and it runs locally with `pnpm docs:dev`. The old website is rebuilt without PHP (approved).
