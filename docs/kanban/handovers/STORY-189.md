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

---

## GROOMING · 2026-10-15T16:00:00Z · claude-opus-5-5 (coordinator) · pending ticket

**Maintainer request (2026-10-15)**: add the old site's "Discord in the website" demo to the ririko.ai landing page. Not yet a ticket; groom as TASK-1895 (requires TASK-1892).
- **Origin**: third party or unknown. Rebuild from scratch in React with our own CSS; use `Z:\Projects\ririko-website\src` (`js/discord.js`, `css/discord.css`, `index.php` lines 82+) only as a visual reference. Copy no code or CSS. No hotlinked Discord CDN avatar; use a repository image.
- **Behaviour**: interactive like the old one. Visitors type commands and get canned bot replies drawn from the generated command catalog (`website/src/data/commands.json`). Nothing is sent to Discord.

**State at pause**: TASK-1891 DONE. TASK-1892 in REVIEW with a rework sent: website `typecheck` fails on a fresh clone (TS2307, generated `commands.json` missing). `scripts/deploy-host.test.ts` fails on Windows only; the file is untouched (pre-existing environment issue).

---

## REVIEW · 2026-10-16T03:05:00Z · claude-opus-5-5 (coordinator) · DONE

All tasks DONE: TASK-1891 (Docusaurus site and link gate), TASK-1892 (landing page and generated commands page), TASK-1895 (interactive Discord-styled demo), TASK-1893 (GitHub Pages workflow, install files, Vercel status page retired), TASK-1894 (wiki migrated). Story estimate raised from 13 to 21 for TASK-1895.

**Maintainer steps after the merge**
1. When 2.0 is on `master`, follow `docs/release.md` 9.1 (Pages source, DNS, HTTPS, first workflow run, delete the Vercel project).
2. Then paste the wiki Home text from `TASK-1894.md` and disable the wiki.
3. With STORY-191, switch the docs `editUrl` and the wiki pointer link from `develop/2.0.0` to `master`.

---

## GROOMING · 2026-10-16T21:30:00Z · claude-opus-5-5 (coordinator) · maintainer decision

- **Demo hint**: keep the ephemeral "Only you can see this" hint for plain text and unknown commands in the landing page demo (TASK-1896). The real bot ignores them, but the hint helps visitors.
- **Open follow-up (Phase B of TASK-1896)**: match the demo to the maintainer's screenshots in `.local/screenshots/` and replace the placeholder card art (the Ririko picture) with real images. Groom it when the screenshots arrive.
