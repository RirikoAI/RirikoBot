# Handover Note: [CHORE-1321] CLI Command to Configure Image Generation Providers & Keys (image-configure)

- **Ticket Type & Points**: Chore | 2 pts
- **Parent**: —
- **Author / Agent**: `devops` / `image-generation`
- **Status**: DONE
- **Timestamp**: 2026-09-24T00:46:00+08:00

---

## 1. Summary of Work Accomplished

`CHORE-1321` implements a dedicated CLI configuration tool and system diagnostic check for the AI Image Generation subsystem, bridging bot administrators to secure environment variables in accordance with [`BLUEPRINT.md`](file:///Z:/Projects/ririko-v2-2026/BLUEPRINT.md) and [`docs/adr/ADR-011`](file:///Z:/Projects/ririko-v2-2026/docs/adr/ADR-011-secrets-management-and-credential-security.md).

### Files Created & Modified

1. **CLI Command Implementation**:
   - [`apps/cli/src/commands/image-configure.ts`](file:///Z:/Projects/ririko-v2-2026/apps/cli/src/commands/image-configure.ts):
     - **Dual Command Name & Alias**: Registered `image-configure` with alias `image:configure`.
     - **Non-Interactive Flags**:
       - `-p, --provider <provider>`: Set primary provider (`gemini`, `comfyui`, `replicate`, `mock`, `auto`).
       - `--gemini-key <key>`: Google Gemini API key (`GEMINI_API_KEY`).
       - `--comfyui-url <url>`: ComfyUI base endpoint URL (`COMFYUI_BASE_URL`).
       - `--replicate-token <token>`: Replicate API token (`REPLICATE_API_TOKEN`).
       - `--daily-quota <quota>`: Per-user daily image generation limit (`IMAGE_DAILY_QUOTA`).
       - `--show`: Display current image generation configuration and status with masked secrets.
       - `-t, --test`: Test connections and validation for configured image generation providers.
       - `-i, --interactive`: Guided step-by-step interactive CLI wizard.
       - `-y, --yes`: Auto-confirm updates without interactive prompts.
       - `--env-file <path>`: Target `.env` file path.
     - **Interactive Wizard**:
       - Prompts for provider selection, credentials per provider, daily quota limits, confirmation, and optional live verification tests.
     - **Masked Credential Security**:
       - Utilizes `maskSecret` to ensure API keys and tokens are never shown in plaintext in logs or console output.
     - **Provider Testing Engine**:
       - Validates Gemini API key formatting and environment presence.
       - Tests ComfyUI REST endpoint reachability (`/system_stats` probe).
       - Validates Replicate API token prefix and length.
       - Verifies Mock offline synthesizer functionality via `@napi-rs/canvas`.

2. **Doctor Diagnostic Integration**:
   - [`apps/cli/src/doctor/checks.ts`](file:///Z:/Projects/ririko-v2-2026/apps/cli/src/doctor/checks.ts):
     - Added `imageGenerationCheck` to system diagnostics (`pnpm cli doctor`).
     - Detects configured providers (`gemini`, `comfyui`, `replicate`, `mock`, or `auto`).
     - Reports active configured providers or provides remediation command guidance (`ririko image-configure`).
     - Added `imageGenerationCheck` to `allChecks` array.

3. **CLI Program Registration**:
   - [`apps/cli/src/program.ts`](file:///Z:/Projects/ririko-v2-2026/apps/cli/src/program.ts):
     - Imported and registered `registerImageConfigureCommand(program)`.

4. **Automated Unit & Integration Tests**:
   - [`apps/cli/src/commands/image-configure.test.ts`](file:///Z:/Projects/ririko-v2-2026/apps/cli/src/commands/image-configure.test.ts):
     - Non-interactive flag-based credential updates.
     - `image:configure` alias execution with multi-provider credentials.
     - Interactive wizard execution flow.
     - Configuration status display (`--show`) with secret masking verification.
     - Provider connection testing execution (`--test`).

---

## 2. Verification Results

```bash
# Unit & Integration Tests
pnpm --filter @ririko/cli exec vitest run src
✓ src/utils/env-editor.test.ts (12 tests) 23ms
✓ src/doctor/engine.test.ts (5 tests) 6ms
✓ src/program.test.ts (5 tests) 9ms
✓ src/commands/stream-configure.test.ts (4 tests) 20ms
✓ src/commands/ai-configure.test.ts (6 tests) 34ms
✓ src/commands/image-configure.test.ts (5 tests) 40ms

Test Files: 6 passed (6)
Tests: 37 passed (37)

# CLI Doctor Diagnostics
pnpm cli doctor
[INFO] Image Generation Subsystem: Active via offline Mock synthesizer (Run 'ririko image-configure' to configure external providers)
Doctor diagnosis completed: 0 issues found.

# Workspace Quality Gates
pnpm typecheck
All 8 workspace packages passed with 0 errors.

pnpm eslint apps/cli/src/commands/image-configure.ts apps/cli/src/commands/image-configure.test.ts apps/cli/src/doctor/checks.ts apps/cli/src/program.ts
0 errors, 0 warnings.
```

---

## 3. Next Steps

- Mark `CHORE-1321` as `DONE` in `docs/kanban/board.json` and `docs/kanban/BOARD.md`.
- Anti-Runaway Barrier Checkpoint: Present accomplishments and inquire if the user would like to create a Pull Request to `develop/2.0.0`.
