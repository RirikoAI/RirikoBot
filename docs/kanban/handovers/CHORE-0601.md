# CHORE-0601 Handover Note: CLI Command to Configure AI Chat Functions & Provider Keys

- **Ticket ID**: `CHORE-0601`
- **Ticket Type**: Chore
- **Parent Epic**: `EPIC-006: AI Chatbot 2.0 with Context Isolation & Safe Tools`
- **Story Points**: 2
- **Completed On**: 2026-09-17
- **Target Branch**: `develop/2.0.0`

---

## 1. Summary of Work Done
Implemented the unified AI configuration CLI command (`ririko ai:configure` and alias `ririko ai:config`, with npm script `pnpm ai:configure`) to allow operators and developers to configure AI chat functions:
1. **Command Syntax & Options**:
   - `ririko ai:configure [options]`
   - `-p, --provider <gemini|openai|ollama>`: Sets default primary AI provider.
   - `-m, --model <model>`: Sets default AI model override.
   - `--gemini-key <key>`: Configures Google Gemini API key.
   - `--openai-key <key>`: Configures OpenAI API key.
   - `--openai-base-url <url>`: Configures custom OpenAI/proxy base URL (OpenRouter, Groq, etc.).
   - `--ollama-url <url>`: Configures Ollama base URL (defaults to `http://localhost:11434`).
   - `--show`: Displays current AI configuration status and masked keys.
   - `--test`: Tests live connectivity & health for configured AI providers (`.checkHealth()`).
   - `-i, --interactive`: Launches the guided interactive terminal setup wizard.
   - `-y, --yes`: Applies flag updates without interactive prompt.
   - `--env-file <path>`: Specifies custom `.env` path to update.
2. **Interactive Terminal Wizard**:
   - Built with native Node.js `node:readline/promises` without extra bloated dependencies.
   - Guides the user through:
     - Selecting primary provider (Google Gemini [flagship recommended], OpenAI, Ollama/Local).
     - Retaining or updating API keys and endpoint URLs with masked previews.
     - Selecting default models with supported model catalog display.
     - Optional secondary / fallback provider configuration.
     - Immediate connectivity verification (`.checkHealth()`).
     - Safe confirmation and write to `.env`.
3. **Safe `.env` File Editor Utility (`apps/cli/src/utils/env-editor.ts`)**:
   - Preserves comments, file formatting, and existing non-AI configuration variables.
   - In-place updates for existing or commented-out keys (`# GEMINI_API_KEY=`).
   - Cleanly appends newly introduced variables under `# AI Chatbot & LLM Providers Configuration`.
   - Utility for masking secret strings in terminal outputs (`maskSecret`).
4. **Core & Runtime Integration**:
   - Added `DEFAULT_AI_PROVIDER`, `DEFAULT_AI_MODEL`, `OPENAI_BASE_URL` to `packages/core/src/config/schema.ts` with legacy aliases.
   - Supported `defaultProviderId` in `FallbackChainManager` (`packages/ai`) to prioritize the selected provider in runtime chat pipelines.
   - Wired `defaultAiProvider` and `OPENAI_BASE_URL` in `apps/bot/src/services.ts`.
   - Updated `.env.example` with documented AI Chatbot section.

---

## 2. Key Files Created & Modified
- `apps/cli/src/commands/ai-configure.ts`: [NEW] Implementation of `ai:configure` and interactive wizard.
- `apps/cli/src/commands/ai-configure.test.ts`: [NEW] Unit tests for CLI flags, metadata, and testing logic.
- `apps/cli/src/utils/env-editor.ts`: [NEW] Safe `.env` read, update, and secret masking utilities.
- `apps/cli/src/utils/env-editor.test.ts`: [NEW] Unit tests for `.env` parsing, updating, and masking.
- `apps/cli/src/program.ts`: [MODIFY] Registered `registerAiConfigureCommand`.
- `apps/cli/src/program.test.ts`: [MODIFY] Added test assertions for `ai:configure` registration.
- `apps/cli/package.json`: [MODIFY] Added `@ririko/ai: "workspace:*"` dependency.
- `packages/core/src/config/schema.ts`: [MODIFY] Added AI provider configuration schema options.
- `packages/ai/src/fallback/fallback-chain-manager.ts`: [MODIFY] Supported `defaultProviderId` prioritization.
- `packages/ai/src/fallback/fallback-chain-manager.test.ts`: [MODIFY] Added tests for `defaultProviderId`.
- `apps/bot/src/services.ts`: [MODIFY] Wired `defaultProviderId` and `OPENAI_BASE_URL` into `FallbackChainManager`.
- `.env.example`: [MODIFY] Documented AI Chatbot configuration variables.
- `package.json`: [MODIFY] Added `"ai:configure"` shortcut script.

---

## 3. Verification & Test Evidence
- `pnpm test apps/cli/src/utils/env-editor.test.ts`: 12/12 passed.
- `pnpm test apps/cli/src/commands/ai-configure.test.ts`: 6/6 passed.
- `pnpm test apps/cli/src/program.test.ts`: 5/5 passed.
- `pnpm test packages/ai/src/fallback/fallback-chain-manager.test.ts`: 12/12 passed.
- `pnpm typecheck`: 8/8 workspace projects passed with 0 errors.
- `pnpm build`: `tsc -b` compiled cleanly with 0 errors.
- `pnpm lint`: 0 errors.
- `pnpm test`: All 61 test files and 694 tests across the entire repository passed.
- CLI verification:
  - `pnpm ai:configure --help`: All options and descriptions rendered.
  - `pnpm ai:configure --show`: Status table with masked credentials rendered.

---

## 4. Gotchas & Decisions
- Monorepo TypeScript strictness enforces `exactOptionalPropertyTypes: true`. Optional interface properties that may receive `undefined` are typed as `T | undefined` rather than just `T?`.
- The CLI command does not overwrite or reorder unrelated keys in `.env` (such as `DISCORD_TOKEN`, `DATABASE_URL`, or Spotify session cookies), ensuring safe zero-loss configuration updates.
