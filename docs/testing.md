# Testing Guide

## 1. Quality Gates
Every change to Ririko must pass automated tests before it is merged. A TypeScript build that passes is the minimum. It does not prove that the code is correct.

Run these commands before you open a pull request:

| Command | What it checks |
| --- | --- |
| `pnpm lint` | The code style (ESLint). |
| `pnpm format:check` | The formatting (Prettier). |
| `pnpm build` | That the TypeScript build passes. |
| `pnpm typecheck` | The types in every workspace package. |
| `pnpm test:coverage` | All tests, with the coverage thresholds. |
| `pnpm test:file-coverage <files>` | The coverage of only the source files you name (see [section 4.1](#41-coverage)). |
| `pnpm test:e2e` | The end-to-end tests of the dashboard. |

CI runs the same gate on every push (see [section 4](#4-continuous-integration)). `pnpm test:coverage` includes the bot integration suites. `pnpm test:integration` runs only those.

---

## 2. Testing Principles

### 2.1. Deterministic Randomness in Tests
- **No flaky tests.** Tests for random number generators (card drops, gambling games, giveaway rolls) must use fixed random seeds.
- Never write tests with probabilistic assertions such as `expect(rareCount).toBeGreaterThan(10)`. Instead, seed the pseudo-random generator (PRNG) and assert exact deterministic outcomes.

### 2.2. Isolated Test Databases
- Repository suites declare their tests with `describeDialects(name, fn)` from `packages/database/src/testing/dialects.ts` (other packages import it as `@ririko/database/testing`). It runs `fn` twice:
  - **SQLite**: a fresh `:memory:` database migrated by `migrateDatabase` for every test.
  - **Postgres**: only when `TEST_POSTGRES_URL` is set, otherwise reported as skipped. Each suite gets a random schema built by the bot's own migration runner (`migrateDatabase`), the tables in use are emptied before every test, and the schema is dropped afterwards.
- Use uuids for ids that Postgres stores as `uuid`, and compare `bigint` columns (balances, XP) with `Number(...)`: Postgres returns them as `bigint`.
- To run the Postgres variants on your computer, use a throwaway container:
  1. Start the container:

     ```bash
     docker run -d --rm --name ririko-pg-test -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine
     ```

  2. Run the tests. In PowerShell, set the two variables with `$env:NAME = 'value'` first.

     ```bash
     TEST_POSTGRES_URL=postgres://postgres:test@127.0.0.1:55432/postgres ADVENTURE_TEST_POSTGRES_URL=postgres://postgres:test@127.0.0.1:55432/postgres pnpm test:postgres
     ```

  3. Stop the container. It deletes itself:

     ```bash
     docker stop ririko-pg-test
     ```

---

## 3. Test Suites & Domain Coverage

### 3.1. Unit Tests (`packages/*/__tests__`)
- **Economy & Banking**: Balance updates, double-entry ledger integrity, daily streaks, negative balance prevention.
- **Anti-Spam & XP**: Rolling window cooldowns, copy-paste similarity rejection, voice XP participant quorums.
- **Waifu TCG Mechanics**: Card drop weighting, element damage multipliers (1.5x), card stat calculations, level-up curves.
- **Moderation Engine**: Warning threshold escalation logic, regex/trie auto-mod filters, permission hierarchy validation.
- **Stream Notification Deduplication**: Idempotency key hash generation and duplicate message prevention.
- **Command Router**: $O(1)$ lookup speed, alias resolution, argument parsing.
- **Dashboard Components**: Vitest runs in `node` by default. Markup tests render with `react-dom/server` through `tests/support/markup.ts`. Tests that click or type opt in to a DOM with a `// @vitest-environment jsdom` first line and use `@testing-library/react` (for example `apps/web/src/components/account-interactions.test.tsx`).

### 3.2. Bot Integration Tests (`apps/bot/test/integration`)
These drive the real bot: `createBotServices` over in-memory SQLite, the command router with its middlewares, every registered command and the component interaction handler, wired by the same functions `main()` uses (`command-router.ts`, `command-set.ts`, `component-interactions.ts`). `apps/bot/test/support/bot-harness.ts` builds it:
- discord.js REST points at the [fake Discord API](#34-fake-discord-api), so every reply is a real HTTP request the fake records.
- Gateway events (`READY`, `GUILD_CREATE`, `MESSAGE_CREATE`, `INTERACTION_CREATE`) enter through discord.js's own packet handler, so commands receive real `Message` and `Interaction` objects. This uses one discord.js internal (`client.ws.handlePacket`), kept in the harness; `harness.test.ts` fails first if an upgrade changes it.
- `harness.sendMessage`, `runSlashCommand`, `runMessageCommand` and `useComponent` build the packets from the fake's fixture; `settle()` waits for every router dispatch to finish; `assertAllRoutesHandled()` fails a test that called a route the fake does not implement.
- Not wired: the gateway connection, voice, and the message listener (automod, XP, card drops, AI chat).

| Suite | Covers |
|---|---|
| `prefix-dispatch.test.ts` | Replies, per-guild prefix, Manage Server check, a command disabled on the dashboard, cooldowns |
| `slash-dispatch.test.ts` | Interaction callbacks, private permission errors, prefix-only commands, a deferred context menu reply edited through the webhook |
| `components.test.ts` | Help center select menu; a giveaway from `/giveaway` through a member's entry to the draw |
| `command-sync.test.ts` | Global and per-server registration on startup, per-server registration when the bot joins a server |

The repository suites and the adventure concurrency suite also run on Postgres (section 2.2 and the `test-postgres` CI job).

### 3.3. End-to-End Tests (`apps/web/e2e`)
Playwright (Chromium) against `next start` on port 3100, configured in `apps/web/playwright.config.ts`:
- The config starts the fake Discord API (port 3199) and the dashboard with `DISCORD_API_URL` pointing at it, after `e2e/support/seed.ts` recreates a SQLite database in the OS temp folder with a 30-card collection for the fake `admin` user.
- `signIn(login)` in `e2e/support/fixtures.ts` sets the fake's `fake_discord_user` cookie and clicks **Sign in with Discord**. The real login route, the fake's authorize and token endpoints (with PKCE checks) and the real callback create the session.
- Each test sends its own `X-Forwarded-For`, because the auth routes allow 20 requests a minute per client IP.
- Every test fails if the dashboard called a Discord route the fake does not implement.
- Specs are named `*.spec.ts` so Vitest does not pick them up.
- The seeded cards have fixed ids and no art asset, so the album renders them without network access and reuses its `public/cards/e2e-card-*.png` cache across runs.

| Spec | Covers |
|---|---|
| `auth.spec.ts` | Sign-in, the new-device DM, sign-out; a forged OAuth2 callback is rejected |
| `guild-access.spec.ts` | Only servers with Manage Server are listed; other servers answer 404; a member without it sees none |
| `settings.spec.ts` | The command prefix persists to `guild_settings`; the AI channel is checked through the bot REST client and persists |
| `album.spec.ts` | Card album paging (newest first, market label) and the rarity filter |

### 3.4. Fake Discord API
`tests/support/fake-discord` is a dependency-free `node:http` server on loopback that both suites use:
- `fixtures.ts`: users, guilds, roles, channels and members with permission bits (`defaultFixture()`: the bot, `admin` who owns *Ririko Test Server*, `member` without permissions there, and *Other Server* where `admin` lacks Manage Server). The same fixture feeds the fake's REST answers and the harness's gateway packets.
- `server.ts`: `startFakeDiscord()` serves the v10 routes the bot and the dashboard call, records every request and its response (`requests`, `find`, `waitFor`), and answers 404 for any other route, listing it in `unhandled`.
- `cli.ts` runs it as a process; `/__fake/requests`, `/__fake/unhandled` and `/__fake/reset` serve other processes.
- To support a new route: add it to the route table in `server.ts`, with a test in `server.test.ts`. Do not make a suite pass by ignoring `unhandled`.

---

## 4. Continuous Integration

CircleCI runs `.circleci/config.yml` on every push to every branch. The `ci` workflow has eight parallel jobs. Each job that runs code on the host (all but `docker` and `secrets`) restores the pnpm store cache, runs `pnpm install --frozen-lockfile` and `pnpm build` first, because every `@ririko/*` package export points at `dist/`.

| Job | Runs | Fails when |
|---|---|---|
| `lint` | `pnpm lint`, `pnpm format:check`, `pnpm db:check` | ESLint reports an error (warnings do not fail), a file is not Prettier-formatted, or a migration gate fails (below) |
| `typecheck` | `pnpm typecheck` | Any workspace package has a type error |
| `test` | `pnpm test:ci` | A test fails, or coverage drops below the thresholds in `vitest.config.ts` |
| `test-postgres` | `pnpm test:postgres` with a `cimg/postgres:16` service container, `TEST_POSTGRES_URL` and `ADVENTURE_TEST_POSTGRES_URL` set | A database or services test fails on Postgres, including the migration runner, adoption and baseline tests in `packages/database/src/migrations` |
| `build-web` | `pnpm --filter @ririko/web build` | The Next.js production build fails |
| `e2e` | Next.js build, then `playwright test` (Chromium cached, fonts installed) | A Playwright spec fails; report and traces are in the job's *Artifacts* tab |
| `docker` | `docker build` of the `bot-runner` and `web-runner` targets on CircleCI's remote Docker engine, then `node scripts/docker-smoke.ts bot web`. Nothing is pushed | An image does not build (for example, a new workspace package is missing from the Dockerfile's `manifests` stage), or a smoke check fails: wrong user, wrong writable directories, FFmpeg missing, the bot not reaching command registration, or the dashboard not serving pages and opening its database (docs/deployment.md section 9.1) |
| `secrets` | `gitleaks git` over the full history with `.gitleaks.toml` | gitleaks finds a secret that is not listed in `.gitleaksignore` |

`pnpm db:check` (`scripts/check-migrations.ts`, tested by `scripts/check-migrations.test.ts`) is the offline gate for the versioned migrations. It needs no database and no network, never writes the real migrations folder, and fails with the file and the statement when:
- **schema**: `drizzle-kit generate` for either dialect would write a new migration, which means a schema change has no migration (it runs on a temporary copy of `packages/database/migrations/`). Fix: `pnpm db:generate`.
- **embedded**: `src/migrations/generated/{sqlite,pg}.ts` differ from the SQL files (rebuilt in memory and compared). Fix: `pnpm db:generate`.
- **safety**: a migration contains `DROP TABLE`, `DROP COLUMN`, `RENAME`, `ALTER COLUMN ... TYPE` or `SET NOT NULL` and its first line is not `-- ririko:contract`. Comments, string literals and quoted identifiers are ignored. The baseline passes.

The SQLite runner treats a migration that contains `PRAGMA foreign_keys=OFF` (a drizzle-kit table rebuild) as SQLite's rebuild procedure; `runner.test.ts` shows that `ON DELETE CASCADE` children survive and that a dangling reference rolls the migration back (see [database.md section 1.5](database.md#15-sqlite-table-rebuilds)).

Git hooks (Husky, installed by `pnpm install`) run the lint checks locally:
- **pre-commit**: blocks `.env` files, scans staged changes with gitleaks, then runs `lint-staged`: `eslint --fix` and `prettier --write` on staged files (rules in `package.json` `lint-staged`), re-staging the fixes.
- **pre-push**: `pnpm lint --quiet` (errors only) and `pnpm format:check`, the same checks as the `lint` job, so a push that would fail CI lint stops locally. Fix with `pnpm lint:fix` and `pnpm format`.

### 4.1. Coverage
- **Merge gate (standing rule for every contributor and agent)**: a PR is **not merged** unless it passes every threshold in `vitest.config.ts` `coverage.thresholds`. The thresholds are lines 80%, functions 81%, statements 79% and branches 68%. The CircleCI `test` job fails below any of them. Run `pnpm test:coverage` before opening a PR, and cover the code you add or change with real tests.
- `pnpm test:ci` runs Vitest with v8 coverage and writes `coverage/` (HTML, `lcov.info`, `coverage-summary.json`) and `test-results/junit.xml`. Run `pnpm test:coverage` locally for the same numbers.
- Coverage counts every source file under `packages/*/src` and `apps/*/src`, including files no test imports.
- **Coverage of the files you add** (`pnpm test:file-coverage <files>`): `pnpm test:coverage` measures the whole project, so a new file with no tests can hide behind the rest. A ticket that adds a source file proves its own coverage with this command, and grooming puts it first in the ticket's `verify_cmd`. Example: `pnpm test:file-coverage packages/core/src/config/guild-config.ts packages/core/src/index.ts`.
  - It takes one or more paths, relative to the repository root or absolute. Each must be a source file that coverage counts (`packages/*/src` or `apps/*/src`, not a test or a `.d.ts` file); otherwise it stops and says which one.
  - It runs `vitest related` on those files, so only the tests that import them run, then checks the coverage of those files alone against the same thresholds as `vitest.config.ts` (it reads them from there). It exits 1 below any threshold, and prints the per-file table so you can see the uncovered lines. A file that no test imports has 0% coverage and fails.
  - The numbers are for the named files together, not each one separately. The report goes to `coverage/file-coverage/`, so it does not overwrite the report of `pnpm test:coverage`. The same note as below applies: a test that reaches the file through a built workspace package (`dist/`) does not count.
  - It does not replace `pnpm test:coverage`, which stays the merge gate.
- **Ratchet rule**: `coverage.thresholds` in `vitest.config.ts` hold the measured baseline, rounded down. Raise them when coverage grows. Never lower them to get a build through; add tests instead.
- A test that imports a workspace package (`@ririko/database`, `@ririko/music`, ...) runs its built `dist/`, which coverage does not count. To cover a package's code, test it from inside that package with a relative import.

### 4.2. Where to find results
- **Test results**: the CircleCI `test` job's *Tests* tab (from `junit.xml`) shows failures, per-test timing and flaky tests.
- **Coverage report**: the `test` job's *Artifacts* tab has the HTML report under `coverage/index.html`.
- **Codecov**: the `test` job uploads `lcov.info` and `junit.xml` to Codecov (needs the `CODECOV_TOKEN` project variable in CircleCI). Codecov comments on PRs with the coverage diff. `codecov.yml` fails the project status only when coverage drops more than 1% from the base commit; patch coverage is informational.

### 4.3. CI Environment
- The `test` job runs on Linux in UTC with FFmpeg and `fonts-dejavu-core` installed. Tests must not depend on the host time zone, path style or locally installed fonts.
- **Tests run offline.** `vitest.setup.ts` refuses every connection and DNS lookup to a host other than loopback (`localhost`, `127.*`, `::1`), and fails the test that tried with `This test tried to reach the network: <hosts>`. A live call would pass or time out depending on how fast YouTube, Spotify, SoundCloud or Deezer answer CircleCI.
  - Replace the client with a fake: `vi.mock` the SDK module (see `packages/music/src/extractors/extractors.test.ts`), `vi.stubGlobal('fetch', ...)`, or pass a `fetchFn` where the class accepts one.
  - `vitest.config.ts` sets `USE_PRIVATE_MUSIC_PACKAGE=false`, so `createBotServices` never loads the private music package during tests. `packages/music-private` is excluded from the public test run and coverage.
  - Do not skip a test on CI to hide a live call. Fake the service instead.

### 4.4. Pre-Release Privacy Scan
Run this before a release, before a branch becomes public, and after any change to deployment docs, `deploy/` or `docs/kanban/`. The repository is public, so no tracked file may hold a live IP address, a private hostname, or the name, region or size of a hosting resource. Placeholders are `192.0.2.x`, `198.51.100.x`, `203.0.113.x`, `2001:db8::`, `<domain>` and `*.example.com`. The WireGuard plan `10.77.0.0/24` is a private design example and may stay. The maintainer's private runbook is not in the repository, so it is never scanned.

Every command below must print nothing. Run them from the repository root in Git Bash or any POSIX shell. They read tracked files only (`git grep`) and skip this section's own file (`':!docs/testing.md'`), because it names the patterns it searches for.

1. Public IPv4 addresses. Documentation, private, loopback, link-local, multicast and reserved ranges are skipped, and so are four public addresses that tests use on purpose as "a public IP" (`1.1.1.1`, `8.8.8.8`, `93.184.216.34`, `192.0.1.1`; the documentation ranges are blocked by `isPrivateOrRestrictedIp`, so they cannot stand in for them).

   ```bash
   git grep -n -I -P -o '(?<![\w./])(?:\d{1,3}\.){3}\d{1,3}(?![\w]|\.\d)' -- . ':!pnpm-lock.yaml' ':!docs/testing.md' |
     awk -F: '{
       ip = $NF; split(ip, o, ".")
       if (o[1] > 255 || o[2] > 255 || o[3] > 255 || o[4] > 255) next
       if (ip ~ /(^|\.)0[0-9]/) next
       if (ip ~ /^(0|10|127)\./ || ip ~ /^192\.168\./ || ip ~ /^169\.254\./) next
       if (ip ~ /^172\.(1[6-9]|2[0-9]|3[01])\./ || ip ~ /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./) next
       if (ip ~ /^(192\.0\.[02]|198\.51\.100|203\.0\.113|198\.1[89])\./ || ip ~ /^(22[4-9]|2[3-5][0-9])\./) next
       if (ip ~ /^(1\.1\.1\.1|8\.8\.8\.8|93\.184\.216\.34|192\.0\.1\.1)$/) next
       print
     }'
   ```

2. Public IPv6 addresses. Documentation (`2001:db8::/32`), link-local, unique-local, multicast and loopback addresses, clock times and one public DNS fixture (`2606:4700:4700::1111`) are skipped.

   ```bash
   git grep -n -I -P -o '(?<![\w:.\/])(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}(?![\w:.])|(?<![\w:.\/])(?:[0-9a-fA-F]{1,4}:){1,6}:(?:[0-9a-fA-F]{1,4})?(?![\w:])' -- . ':!pnpm-lock.yaml' ':!docs/testing.md' |
     awk -F: '{ ip = substr($0, length($1) + length($2) + 3)
       if (ip ~ /^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?$/) next
       if (ip ~ /^(2001:db8|fe[89ab][0-9a-f]|f[cd][0-9a-f][0-9a-f]|ff[0-9a-f][0-9a-f]):/ || ip ~ /^::/) next
       if (ip == "2606:4700:4700::1111") next
       print
     }'
   ```

3. Project-domain hostnames other than `ririko.ai` and `dashboard.ririko.ai`. Use `*.example.com` names in docs, tests and examples.

   ```bash
   git grep -n -I -i -o -P '(?<![\w.-])(?!dashboard\.)[a-z0-9-]+\.ririko\.ai\b' -- . ':!docs/testing.md'
   ```

4. Regions, availability zones and instance sizes. Describe hosts by role ("the app host", "the Lavalink host"). This command holds only generic patterns: provider and plan names must never appear in a tracked file, this one included, so they live only in `.local/private-terms.txt` (command 5). Keep sizes and plan names in the private runbook.

   ```bash
   git grep -n -I -i -P '\b(?:us|eu|ap|sa|ca|me|af)-(?:east|west|central|north|south|southeast|northeast)-\d\b|\bKVM\b|\bNVMe\b|\b\d+ ?GB (?:of )?RAM\b' -- . ':!pnpm-lock.yaml' ':!docs/testing.md'
   ```

5. The maintainer's own list of private terms: the real provider and plan names, bucket names, host names and ping URLs from the private runbook. Keep one fixed string per line in `.local/private-terms.txt` (git-ignored, never committed).

   ```bash
   test -f .local/private-terms.txt && git grep -n -I -i -F -f .local/private-terms.txt -- . ':!docs/testing.md'
   ```

6. Secrets: the same command as CircleCI's `secrets` job, over the full history. Known findings are listed in `.gitleaksignore`. Staged changes are also scanned by the pre-commit hook.

   ```bash
   gitleaks git --redact --no-banner --config .gitleaks.toml
   ```

A hit is fixed in the tree: replace it with a placeholder or generic wording and run the scan again. A hit in history needs the maintainer's decision (a history rewrite is never an agent's call). To allow a new public test fixture, add it to the allowlist in command 1 or 2 and say why in the pull request.
