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
```

CI runs the same gate on every push (see [Section 4](#4-continuous-integration)). `pnpm test:integration` and `pnpm test:e2e` join the gate with STORY-120.

---

## 2. Testing Principles

### 2.1. Deterministic Randomness in Tests
- **No Flaky Tests**: Tests for random number generators (card drops, gambling games, giveaway rolls) MUST use fixed random seeds.
- Never write tests with probabilistic assertions such as `expect(rareCount).toBeGreaterThan(10)`. Instead, seed the pseudo-random generator (PRNG) and assert exact deterministic outcomes.

### 2.2. Isolated Test Databases
- Integration tests execute against an isolated in-memory SQLite database or a dedicated Docker PostgreSQL test container.
- Each test file runs migrations fresh and truncates tables between test suites.

---

## 3. Test Suites & Domain Coverage

### 3.1. Unit Tests (`packages/*/__tests__`)
- **Economy & Banking**: Balance updates, double-entry ledger integrity, daily streaks, negative balance prevention.
- **Anti-Spam & XP**: Rolling window cooldowns, copy-paste similarity rejection, voice XP participant quorums.
- **Waifu TCG Mechanics**: Card drop weighting, element damage multipliers (1.5x), card stat calculations, level-up curves.
- **Moderation Engine**: Warning threshold escalation logic, regex/trie auto-mod filters, permission hierarchy validation.
- **Stream Notification Deduplication**: Idempotency key hash generation and duplicate message prevention.
- **Command Router**: $O(1)$ lookup speed, alias resolution, argument parsing.

### 3.2. Integration Tests (`tests/integration`)
- **Drizzle Database Repositories**: Verifies dual-dialect queries against both PostgreSQL and SQLite.
- **Discord Gateway Event Dispatcher**: Verifies event flow from `messageCreate` and `interactionCreate` through middleware to command execution.
- **Provider Fallback Handlers**: Mocks primary API timeouts (e.g. Gemini 429) to verify automatic fallback to OpenAI or local Ollama.
- **Atomic Trading & Market**: Verifies ACID transactions during simultaneous two-party trades and market purchases.

### 3.3. End-to-End Tests (`apps/web/e2e`)
Powered by **Playwright**:
- **OAuth2 Login Flow**: Mock Discord OAuth callback and session creation.
- **Guild Switcher & Permissions**: Confirms guilds without `ManageGuild` permission are inaccessible.
- **Module Configuration**: Modifies a setting in the web UI (e.g. changing prefix or AI channel) and verifies database persistence.
- **Card Album Viewer**: Inspects card collection pagination, filters, and market listings.

---

## 4. Continuous Integration

CircleCI runs `.circleci/config.yml` on every push to every branch. The `ci` workflow has five parallel jobs. Each Node job restores the pnpm store cache, runs `pnpm install --frozen-lockfile` and `pnpm build` first, because every `@ririko/*` package export points at `dist/`.

| Job | Runs | Fails when |
|---|---|---|
| `lint` | `pnpm lint`, `pnpm format:check` | ESLint reports an error (warnings do not fail), or a file is not Prettier-formatted |
| `typecheck` | `pnpm typecheck` | Any workspace package has a type error |
| `test` | `pnpm test:ci` | A test fails, or coverage drops below the thresholds in `vitest.config.ts` |
| `build-web` | `pnpm --filter @ririko/web build` | The Next.js production build fails |
| `secrets` | `gitleaks git` over the full history with `.gitleaks.toml` | gitleaks finds a secret that is not listed in `.gitleaksignore` |

### 4.1. Coverage
- `pnpm test:ci` runs Vitest with v8 coverage and writes `coverage/` (HTML, `lcov.info`, `coverage-summary.json`) and `test-results/junit.xml`. Run `pnpm test:coverage` locally for the same numbers.
- Coverage counts every source file under `packages/*/src` and `apps/*/src`, including files no test imports.
- **Ratchet rule**: `coverage.thresholds` in `vitest.config.ts` hold the measured baseline, rounded down. Raise them when coverage grows. Never lower them to get a build through; add tests instead.
- Baseline on 2026-09-26: statements 65.8%, branches 54.5%, functions 69.3%, lines 67.2%.

### 4.2. Where to find results
- **Test results**: the CircleCI `test` job's *Tests* tab (from `junit.xml`) shows failures, per-test timing and flaky tests.
- **Coverage report**: the `test` job's *Artifacts* tab has the HTML report under `coverage/index.html`.
- **Codecov**: the `test` job uploads `lcov.info` and `junit.xml` to Codecov (needs the `CODECOV_TOKEN` project variable in CircleCI). Codecov comments on PRs with the coverage diff. `codecov.yml` fails the project status only when coverage drops more than 1% from the base commit; patch coverage is informational.

### 4.3. CI Environment
- The `test` job runs on Linux in UTC with FFmpeg and `fonts-dejavu-core` installed. Tests must not depend on the host time zone, path style or locally installed fonts.
- `packages/music/src/extractors/extractors.test.ts` calls YouTube, Spotify, SoundCloud and Deezer live. A live test that an upstream service blocks from CircleCI IPs may use `it.skipIf(process.env.CI)` only when another CI-run test covers the same code path; say which one in a comment.
