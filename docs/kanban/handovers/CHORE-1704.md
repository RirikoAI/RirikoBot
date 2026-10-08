# Handover Notes: CHORE-1704 Ship the ririko CLI in the Bot Image So Operators Run It With docker exec

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-08T01:10:00Z · Claude Code (Opus 5.5)

**Why**
- The maintainer asked how to run `ririko passkeys:reset <user_id>` on staging. The bot image has no CLI: on the host, `/app/apps/cli` holds only `package.json`.
- Today the only way is an SSH port-forward to Postgres with the database password on the maintainer's PC. The maintainer chose to ship the CLI in the bot image.

**Approach**
1. In `Dockerfile`, change the `bot-deps` stage to `--filter @ririko/cli...`. `@ririko/cli` depends on `@ririko/bot`, so the bot keeps every dependency it has today.
2. In `bot-runner`, add `COPY --from=build /app/apps/cli/dist apps/cli/dist`.
   - `@ririko/cli` imports `@ririko/ai` directly. Check that `packages/ai/dist` is already copied (it is).
3. Add a root-owned wrapper at `/usr/local/bin/ririko`, created in a `RUN` before `USER 10001:10001`:
   ```sh
   #!/bin/sh
   exec node /app/apps/cli/dist/index.js "$@"
   ```
   - A wrapper is more robust than a symlink to `index.js`: tsc does not set the exec bit.
   - `docker exec` keeps `WORKDIR /app` and the container env, so relative `./data/...` and `DATABASE_URL` resolve as they do for the bot.
4. Add a smoke check in `scripts/docker-smoke.ts`, next to `uidCheck` and `botBootCheck`. It runs `docker run --rm --entrypoint ririko ririko-bot:smoke --help` (or through the existing `shell()` helper) and checks for exit code 0 and `passkeys:reset` in the output.

**Pitfalls**
- The CLI loads every command module at startup (`program.ts`). Any module that imports a devDependency (tsx, vitest, drizzle-kit, prettier ...) at the top fails with prod deps only.
  - Check before you rely on the image: build locally, then `pnpm --filter @ririko/cli deploy --prod` or just inspect the imports.
  - Commands such as `dev` and `generate:*` may need lazy imports. Their behaviour must not change.
- The maintainer's PC has no Docker, so the CircleCI `docker` job is the first real build-and-smoke run.
- Do not touch the web image, the bot CMD or HEALTHCHECK, or the writable directories.

**Out of scope**
- Changing what any CLI command does.
- Adding the CLI to the web image.

---

## PROGRESS · 2026-10-08T01:25:00Z · claude-medium / Claude Sonnet 5.5 · REVIEW

**Files changed**
- `Dockerfile`: `bot-deps` installs with `--filter @ririko/cli...` (comment updated); `bot-runner` copies `apps/cli/dist` and writes a root-owned `/usr/local/bin/ririko` wrapper (`#!/bin/sh`, `exec node /app/apps/cli/dist/index.js "$@"`, mode 755) in a `RUN` before `USER 10001:10001`. CMD, HEALTHCHECK, user, writable directories and the web image are untouched.
- `scripts/docker-smoke.ts`: new `botCliCheck` (runs `ririko --help` through `shell()`, fails unless exit 0 and the output lists `passkeys:reset`, `guild:config`, `economy:config`, `doctor`), added to the bot `extraChecks`; `apps/cli/dist/index.js` and `/usr/local/bin/ririko` added to the bot `readOnlyPaths`, so the existing filesystem check proves the app user cannot write them.
- `docs/deployment.md`: `bot-deps` and `bot-runner` table rows, new "Operator commands" bullet with the `docker exec <bot container> ririko passkeys:reset <user_id>` form, then `--yes`.
- `docs/dashboard.md`: passkey recovery line shows the `docker exec` form and `--yes`.

**Verification**
- `verify_cmd` passes: `pnpm build`, `pnpm typecheck`, `pnpm vitest run scripts/docker-smoke apps/cli/src` (21 files, 186 tests), `pnpm lint --quiet`, `pnpm format:check`, `node apps/cli/dist/index.js --help`.
- No commit made; branch `chore/CHORE-1704-cli-in-bot-image`.
- Production-dependency proof without Docker: in a scratch folder under the OS temp dir I copied only the root manifests, lockfile, `.npmrc` and the nine workspace `package.json` files (the `manifests` stage), ran the exact `bot-deps` install (`pnpm install --prod --frozen-lockfile --ignore-scripts --filter "@ririko/cli..."`), copied the same `dist` folders the Dockerfile copies, then ran `node apps/cli/dist/index.js --help`. It exited 0 and listed all 14 commands (info, doctor, migrate:*, db:copy, ai/stream/image configure, guild:config, economy:config, tcg:rules, passkeys:reset, commands:sync/reset, bot:maintenance). `node .../index.js passkeys:reset 123456789012345678` also opened the SQLite database and reported 0 passkeys. The `.pnpm` store of that install held no tsx, vitest, typescript, drizzle-kit or prettier. The scratch folder was deleted.
- No CLI command imported a devDependency at load time (vitest appears only in `*.test.ts`), so no lazy imports were needed and no command behaviour changed.

**Not proven here (only the CircleCI `docker` and release jobs prove it)**
- The Dockerfile itself builds (BuildKit mount, `printf` wrapper in Debian's `sh`, `chmod`), and the `COPY --from=bot-deps /app ./` layout carries the CLI's `node_modules` symlinks correctly. The scratch run mimicked this on Windows paths, not in the Linux image.
- The wrapper is on the app user's PATH at `docker exec`, runs from `/app`, and uses the container env (`DATABASE_URL` and the others).
- `botCliCheck` itself and the new `readOnlyPaths` entries (no unit test: `scripts/docker-smoke.ts` has no test file and shells out to `docker`).
- Native modules with `--ignore-scripts` on Linux: on Windows the SQLite open worked, but the Linux prebuilt binary path is the same one the bot already relies on.

**Decisions & gotchas**
- A wrapper script instead of a symlink: tsc does not set the exec bit.
- `--filter @ririko/cli...` is a superset of the old `@ririko/bot...` set, so the bot loses nothing. The only extra production packages are the CLI's own (`commander`, `picocolors`; `discord.js` is already a bot dependency).
- The smoke check uses `--network none` (via `shell()`); `--help` needs no network.
- Local `prettier --write` through `npx` reformatted an unrelated `for (...;)` line in `docker-smoke.ts`; I reverted it, because the repo's pinned prettier 3.9.6 wants the original form.

**New CodeGraph queries**
- None needed beyond the ticket's two.

**Next steps**
- Coordinator review, then let the CircleCI `docker` job build and smoke the image; after a release deploy, try `docker exec <bot container> ririko passkeys:reset <user_id>` on staging.

---

## REVIEW · 2026-10-08T01:40:00Z · Claude Code (Opus 5.5) · REVIEW

- Reran `verify_cmd`: build, typecheck, 186 tests, lint, format and `node apps/cli/dist/index.js --help` all pass.
- Read the diff:
  - `bot-deps` installs with `--filter @ririko/cli...`.
  - `apps/cli/dist` is copied into the image, and a root-owned 755 wrapper is written before `USER`.
  - `botCliCheck` goes through `shell()`, so it runs as uid 10001 from `/app`.
  - The read-only checks cover the wrapper and the CLI entry.
  - CMD, HEALTHCHECK and the web image are unchanged.
- The worker proved the CLI loads on the exact production install, outside Docker.
- The ticket stays in REVIEW until CircleCI's `docker` job builds the image and passes `botCliCheck` on the PR.

---

## REVIEW · 2026-10-08T02:10:00Z · Claude Code (Opus 5.5) · DONE

- PR #689: every CircleCI job passes. The `docker` job built `bot-runner` and passed `botCliCheck`, which runs `ririko --help` as uid 10001 from `/app` and lists the operator commands, plus the read-only checks for the wrapper and the CLI entry.
- Codecov reports that every changed line is covered.
- Every acceptance item is met. On a host, the CLI arrives with the next release tag.
