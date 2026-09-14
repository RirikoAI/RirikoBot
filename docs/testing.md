# Testing Strategy & Quality Assurance (Ririko AI 2.0.0)

## 1. Overview & Quality Gates
In accordance with Sections 55 and 56 of `BLUEPRINT.md`, Ririko AI 2.0.0 enforces strict automated testing before any feature or milestone is marked complete. TypeScript compilation is a minimum prerequisite, not proof of correctness.

### Required Quality Gate:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

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
