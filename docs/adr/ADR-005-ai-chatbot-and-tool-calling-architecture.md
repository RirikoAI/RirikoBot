# ADR-005: AI providers, scoped memory and tools

## Status

Proposed future subsystem. Legacy provider adapters are audited; the new conversation store and tool engine are not implemented.

## Problem

Legacy supports Ollama, Google AI, OpenRouter and OpenAI. Conversation history is unbounded command RAM keyed only by user ID, so it disappears on restart and can mix guild/channel contexts. Slash and prefix model selection differ. The music-action regex recognizes musical-note markers, but its execution method only logs that the feature is not implemented; working autonomous music playback must not be claimed as legacy behavior.

## Options considered

- Repair command-local adapters and retain ephemeral prompts.
- Adopt one provider-specific agent abstraction throughout the application.
- Use capability-aware provider adapters, scoped persistent sessions and a bounded application-owned tool registry.

## Decision proposed

Use provider-neutral chat/stream/tool contracts with adapters for verified Gemini, OpenAI, Ollama and explicitly configured compatible endpoints, preserving OpenRouter functionality. Account-available model IDs, streaming/tools capabilities, quotas and pricing are runtime configuration evidence, not guessed constants.

Persist sessions with explicit **guild/channel/user identity**. Define a separate DM scope rather than using an absent guild as an ambiguous global key. Apply retention, deletion and token/message bounds; isolate personality settings from trusted system/tool rules. Untrusted conversation text and retrieved content never supply actor identity or grant permissions.

Tools have registered names, strict input schemas, bounded outputs, timeouts and execution budgets. Reuse authenticated service authorization at call time. A clock tool reads actual system time and configured timezone. Allow only implemented operations; disable autonomous destructive moderation/data actions. Do not expose generic shell, filesystem, SQL or arbitrary HTTP tools. Limit tool rounds and handle provider cancellation/failure without replaying committed side effects.

Buffer streamed output to Discord-sized messages, coalesce edits and honor transport limits. Keep slash and prefix on the same provider/model/session path.

## Consequences

Persistence and tool validation improve inspectability but do not guarantee model correctness or prompt-injection immunity. Providers differ in tools, token accounting, safety responses and streaming semantics. Users need clear retention/provider choices; fallbacks must preserve configured data handling and cost constraints.

## Validation and evidence

Require tests for scope isolation, truncation/deletion, restart, partial streams, malformed/unknown tool calls, denied actions, timeout/cancellation, tool-loop budgets and replay boundaries. Live provider checks are distinct from mocks. See [AI legacy findings](../legacy-feature-inventory.md), [provider evaluation](../dependency-evaluation.md), [secrets](ADR-011-secrets-management-and-credential-security.md) and [authorization](ADR-013-configuration-permissions-and-concurrency.md).
