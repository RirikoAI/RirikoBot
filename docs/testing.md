# Testing Strategy & Quality Assurance (Ririko AI 2.0.0)

## 1. Overview & Quality Gates
In accordance with Sections 55 and 56 of `BLUEPRINT.md`, Ririko AI 2.0.0 enforces strict automated testing before any feature or milestone is marked complete. TypeScript compilation is a minimum prerequisite, not proof of correctness.

### Required Quality Gate:
```bash
pnpm lint
pnpm format:check
pnpm build
pnpm typecheck
pnpm test:coverage
pnpm test:e2e
```

CI runs the same gate on every push (see [Section 4](#4-continuous-integration)). `pnpm test:coverage` includes the bot integration suites; `pnpm test:integration` runs only those (STORY-120).

---

## 2. Testing Principles

### 2.1. Deterministic Randomness in Tests
- **No Flaky Tests**: Tests for random number generators (card drops, gambling games, giveaway rolls) MUST use fixed random seeds.
- Never write tests with probabilistic assertions such as `expect(rareCount).toBeGreaterThan(10)`. Instead, seed the pseudo-random generator (PRNG) and assert exact deterministic outcomes.

### 2.2. Isolated Test Databases
- Repository suites declare their tests with `describeDialects(name, fn)` from `packages/database/src/testing/dialects.ts` (other packages import it as `@ririko/database/testing`). It runs `fn` twice:
  - **SQLite**: a fresh `:memory:` database with `SQLITE_SCHEMA_DDL` for every test.
  - **Postgres**: only when `TEST_POSTGRES_URL` is set, otherwise reported as skipped. Each suite gets a random schema built with the bot's own bootstrap (`ensurePostgresSchema` and the startup upgrades), the tables in use are emptied before every test, and the schema is dropped afterwards.
- Use uuids for ids that Postgres stores as `uuid`, and compare `bigint` columns (balances, XP) with `Number(...)`: Postgres returns them as `bigint`.
- Run the Postgres variants locally against a throwaway container:
  ```bash
  docker run -d --rm --name ririko-pg-test -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine
  TEST_POSTGRES_URL=postgres://postgres:test@127.0.0.1:55432/postgres ADVENTURE_TEST_POSTGRES_URL=postgres://postgres:test@127.0.0.1:55432/postgres pnpm test:postgres
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
| `lint` | `pnpm lint`, `pnpm format:check` | ESLint reports an error (warnings do not fail), or a file is not Prettier-formatted |
| `typecheck` | `pnpm typecheck` | Any workspace package has a type error |
| `test` | `pnpm test:ci` | A test fails, or coverage drops below the thresholds in `vitest.config.ts` |
| `test-postgres` | `pnpm test:postgres` with a `cimg/postgres:16` service container, `TEST_POSTGRES_URL` and `ADVENTURE_TEST_POSTGRES_URL` set | A database or services test fails on Postgres |
| `build-web` | `pnpm --filter @ririko/web build` | The Next.js production build fails |
| `e2e` | Next.js build, then `playwright test` (Chromium cached, fonts installed) | A Playwright spec fails; report and traces are in the job's *Artifacts* tab |
| `docker` | `docker build` of the `bot-runner` and `web-runner` targets on CircleCI's remote Docker engine, then `node scripts/docker-smoke.ts bot web`. Nothing is pushed | An image does not build (for example, a new workspace package is missing from the Dockerfile's `manifests` stage), or a smoke check fails: wrong user, wrong writable directories, FFmpeg missing, the bot not reaching command registration, or the dashboard not serving pages and opening its database (docs/deployment.md section 2.1) |
| `secrets` | `gitleaks git` over the full history with `.gitleaks.toml` | gitleaks finds a secret that is not listed in `.gitleaksignore` |

Git hooks (Husky, installed by `pnpm install`) run the lint checks locally:
- **pre-commit**: blocks `.env` files, scans staged changes with gitleaks, then runs `lint-staged`: `eslint --fix` and `prettier --write` on staged files (rules in `package.json` `lint-staged`), re-staging the fixes.
- **pre-push**: `pnpm lint --quiet` (errors only) and `pnpm format:check`, the same checks as the `lint` job, so a push that would fail CI lint stops locally. Fix with `pnpm lint:fix` and `pnpm format`.

### 4.1. Coverage
- **Merge gate (standing rule for every contributor and agent)**: a PR is **not merged** unless it passes every threshold in `vitest.config.ts` `coverage.thresholds`. On 2026-09-28 they are lines 67%, functions 69%, statements 65% and branches 54%. The CircleCI `test` job fails below any of them. Run `pnpm test:coverage` before opening a PR, and cover the code you add or change with real tests.
- `pnpm test:ci` runs Vitest with v8 coverage and writes `coverage/` (HTML, `lcov.info`, `coverage-summary.json`) and `test-results/junit.xml`. Run `pnpm test:coverage` locally for the same numbers.
- Coverage counts every source file under `packages/*/src` and `apps/*/src`, including files no test imports.
- **Ratchet rule**: `coverage.thresholds` in `vitest.config.ts` hold the measured baseline, rounded down. Raise them when coverage grows. Never lower them to get a build through; add tests instead.
- Baseline on 2026-09-26: statements 65.8%, branches 54.5%, functions 69.3%, lines 67.2%.
- Measured on 2026-09-28 (PR #658): statements 67.1%, branches 56.4%, functions 69.4%, lines 68.5%.
- A test that imports a workspace package (`@ririko/database`, `@ririko/music`, ...) runs its built `dist/`, which coverage does not count. To cover a package's code, test it from inside that package with a relative import.

### 4.2. Where to find results
- **Test results**: the CircleCI `test` job's *Tests* tab (from `junit.xml`) shows failures, per-test timing and flaky tests.
- **Coverage report**: the `test` job's *Artifacts* tab has the HTML report under `coverage/index.html`.
- **Codecov**: the `test` job uploads `lcov.info` and `junit.xml` to Codecov (needs the `CODECOV_TOKEN` project variable in CircleCI). Codecov comments on PRs with the coverage diff. `codecov.yml` fails the project status only when coverage drops more than 1% from the base commit; patch coverage is informational.

### 4.3. CI Environment
- The `test` job runs on Linux in UTC with FFmpeg and `fonts-dejavu-core` installed. Tests must not depend on the host time zone, path style or locally installed fonts.
- **Tests run offline.** `vitest.setup.ts` refuses every connection and DNS lookup to a host other than loopback (`localhost`, `127.*`, `::1`), and fails the test that tried with `This test tried to reach the network: <hosts>`. Live calls used to pass or time out depending on how fast YouTube, Spotify, SoundCloud or Deezer answered CircleCI.
  - Replace the client with a fake: `vi.mock` the SDK module (see `packages/music/src/extractors/extractors.test.ts`), `vi.stubGlobal('fetch', ...)`, or pass a `fetchFn` where the class accepts one.
  - `vitest.config.ts` sets `USE_PRIVATE_MUSIC_PACKAGE=false`, so `createBotServices` never loads the private music package during tests. `packages/music-private` is excluded from the public test run and coverage.
  - Do not skip a test on CI to hide a live call. Fake the service instead.
