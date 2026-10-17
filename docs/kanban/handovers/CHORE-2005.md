# CHORE-2005 · Publish the Kanban Board on Vercel, and Bind the Local Board Server to 127.0.0.1

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-18T14:40:00Z · claude-opus-5-5 (coordinator)

**Background**
- The repository is connected to the Vercel project `ririko-bot`. It used to deploy a status page (`vercel.json` + `scripts/build-status-site.ts`). TASK-1893 removed both, so every pull request now shows a failing "Vercel" check (seen on #708 and #711).
- The maintainer wants that Vercel project to publish the Kanban board instead: the same read-only view that `scripts/kanban/board-server.mjs` serves locally, with `scripts/kanban/board-web/index.html` as the page.
- The board files are already public in the repository, so the site exposes nothing new. It must stay read-only.
- Commit `f801ab1` changed the board server to listen on a private LAN address (lines near the end of `board-server.mjs`: `server.listen(port, '<address>')` twice and the printed URL). The maintainer's rule is that no host addresses go into the repository. Default to `127.0.0.1`, add `--host=<address>` (and `HOST`), and the maintainer passes their address locally. Do not write that address into any file, note or test.

**Approach**
1. `scripts/kanban/build-board-site.mjs` (plain ESM, Node built-ins only, like `board-server.mjs`): read `docs/kanban/` the same way the server does (reuse the same paths and the `NOT_NOTES` rule; if sharing code is simple, move the shared bits into a small module both files import, otherwise keep the build script self-contained). Write `board-dist/index.html` and data files, for example `board-dist/data/board.json`, `data/handovers.json`, `data/handovers/<ID>.md`, `data/flags.md`, `data/meta.json`. Validate that `board.json` parses and fail the build otherwise.
2. `board-web/index.html`: the page fetches through `get(url, kind)` (line ~248), loads `/api/board`, `/api/handovers`, `/api/flags`, `/api/meta` (line ~260) and notes from `/api/handovers/<id>` (line ~529), and opens `EventSource('/api/events')` (line ~691). Add one switch, for example the build script injects `<script>window.BOARD_STATIC = { base: 'data/', ref: ..., sha: ... }</script>` before the page script, and a small URL mapping function picks static paths when it is set. In static mode skip the EventSource. Keep the server mode exactly as it is.
3. `vercel.json` per the acceptance. Vercel runs the build with its own Node (22 or newer).
4. `board-server.mjs` host option per the acceptance.
5. Ignore `board-dist/` in `.gitignore` and, if needed, `.prettierignore` and the ESLint config.
6. Docs: `docs/kanban/protocol.md` line 196 and `docs/release.md` around lines 576 and 587.
7. Test per the acceptance; run `verify_cmd`. Then serve `board-dist/` with any static server (for example `npx serve board-dist -l 4488`) and check the board, a note and the flags render, with no console error.

**Pitfalls**
- Vercel treats a top-level `api/` folder in the project as serverless functions, so do not name the output folder or data folder `api`.
- Handover ids in file names: keep the strict id pattern `^[A-Za-z]+-\d+$` the server uses.
- `render-board.mjs` must still pass; do not change board validation.
- `scripts/deploy-host.test.ts` fails on Windows for unrelated reasons; `verify_cmd` only runs `scripts/kanban`.

**Out of scope**
- Vercel dashboard settings (production branch, domain): the maintainer sets them. Note what they should check in the PROGRESS entry.
- History rewrite of `f801ab1`.

---

## PROGRESS · 2026-10-17T22:31:00Z · claude-medium (Claude Sonnet 5.5) · REVIEW

**Files changed**
- `scripts/kanban/build-board-site.mjs` (new): plain ESM, Node built-ins only. Validates `board.json`, empties the output folder, then writes `index.html` plus `data/board.json`, `data/handovers.json`, `data/notes/<ID>.md`, `data/flags.md` and `data/meta.json`. Options `--root=` and `--out=` (default `board-dist/`). It refuses an `--out` that contains the project. It keeps its own copy of the `NOT_NOTES` rule and the strict ID pattern instead of sharing a module with `board-server.mjs`, which keeps both files standalone. The project name in `meta.json` is `VERCEL_GIT_REPO_SLUG` when set (the folder name on Vercel is not the project name), else the folder name.
- `scripts/kanban/board-web/index.html`: `dataUrl()` maps `/api/*` to the static files when `window.BOARD_STATIC` is set; `connect()` skips the `EventSource` in that mode, shows "snapshot" in the live badge and puts "Snapshot of <branch> at <sha7>" (from `VERCEL_GIT_COMMIT_REF` and `VERCEL_GIT_COMMIT_SHA`) in its tooltip. Server mode is unchanged.
- `scripts/kanban/board-server.mjs`: default listen address is `127.0.0.1`; `--host=<address>` or `HOST` overrides it, and the printed URL uses it. No other IP address is left in the file (the port-retry path used the same address, now `host`).
- `vercel.json` (new): framework null, no-op install command, `node scripts/kanban/build-board-site.mjs`, output `board-dist`.
- `.gitignore`: `board-dist/`. `.prettierignore` and `eslint.config.mjs` needed no change: both already ignore `scripts/kanban/`.
- `docs/kanban/protocol.md` (section 6.1): `--host` and the published board. `docs/release.md`: the Vercel project is kept and hosts the board; the "delete the Vercel project" step now says to keep it and check two dashboard settings.
- `scripts/kanban/build-board-site.test.ts` (new): 7 tests with a fixture tree in a temp folder.

**Verification**
- `verify_cmd`: build OK (381 notes); `pnpm vitest run scripts/kanban` 7 passed; `pnpm format:check` clean; `pnpm lint --quiet` clean.
- Browser check: `board-dist/` served by a small static server on port 4488 rendered the board (459 cards), the CHORE-2005 drawer and its Handover tab (GROOMING entry shown), with no console messages and the badge on "snapshot". `board-server.mjs --port=4499` still reads `/api/*`, shows "live" and `BOARD_STATIC` is null. The open flags list is empty in both (HANDOVERS.md has only its header rows). My two test servers are stopped; the maintainer's servers on 4477 and 3100 were not touched.
- `render-board.mjs` still passes; board validation is unchanged.

**For the maintainer (Vercel dashboard)**
- Project `ririko-bot`, Settings, General: Root Directory is the repository root; Framework Preset reads "Other" (vercel.json sets it to null); no Build Output or Install overrides that conflict with vercel.json.
- Settings, Git: Production Branch is the branch whose board should be public (`develop/2.0.0` or `master`). Other branches get preview URLs, which are public by default unless Deployment Protection is on.
- The environment variables `VERCEL_GIT_REPO_SLUG`, `VERCEL_GIT_COMMIT_REF` and `VERCEL_GIT_COMMIT_SHA` must be exposed to the build ("Automatically expose System Environment Variables", on by default). The site still builds without them.
- A custom domain, if wanted, is added in Settings, Domains.

**Decisions and notes**
- Data folder is `data/` (not `api/`), as the grooming pitfall requires.
- A missing note file in the static site is a 404, which the page already shows as "Could not load".
- Shared-module option not taken: the duplicated bits are about six lines.
- `board-dist/` is left on disk after verification (git-ignored).

**CodeGraph queries that helped**
- `board-server boardPath handoverDir routes send` returned the full server source; the second query (`board-web index.html fetch get EventSource`) did not index the HTML page, so line ranges were read with sed.

---

## REVIEW · 2026-10-18T15:20:00Z · claude-opus-5-5 (coordinator) · DONE

- Reran `verify_cmd`: site build, 7 `scripts/kanban` tests, `format:check`, `lint --quiet` pass.
- Diff: `board-server.mjs` binds `host` (default `127.0.0.1`, `--host` or `HOST`); `vercel.json` builds `board-dist` with no dependencies; the page has a static mode; docs updated.
- `git grep` finds no LAN address in tracked files; the remaining `10.0.0.x` hits are test fixtures and range descriptions.
- Worker tier: claude-medium (Sonnet), matches the ticket tier.
