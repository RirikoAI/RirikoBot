# ADR-005: AI Chatbot and Safe Tool Calling Architecture

## Status
Accepted

## Context
In Ririko 1.4.0, conversational AI was handled by concatenating chat strings in an in-memory array (`userPrompts: UserPrompts = []`), which vanished on bot restart. Tool execution was implemented via brittle post-reply regex matching (detecting `🎵 song title 🎵` in the AI's raw output text and invoking `play`).

## Decision
1. **Multi-Provider Adapter Pipeline**: Introduce a unified `AiProvider` interface with native adapters for:
   - **Google Gemini** (`@google/genai`)
   - **OpenAI** (`openai` official SDK)
   - **Ollama / OpenRouter** (custom HTTP adapter)
2. **Persistent Conversation Memory**: Store chat sessions and message histories in the database (`ai_conversations`, `ai_messages`) with automatic token-based sliding window truncation.
3. **Structured Tool / Function Calling**: Replace regex matching with native LLM tool calling using strict Zod JSON schemas.
4. **Safety & Guardrails**:
   - Strictly prohibit autonomous execution of destructive actions (kicking/banning members, clearing database).
   - Only allow safe utility tools (`get_current_time`, `search_anime`, `queue_song`, `check_balance`, `flip_coin`).
   - Debounce Discord streaming message edits to comply with Discord rate limits (max 1 edit per 1.5s).

## Consequences
### Positive
- Natural, contextual conversations that survive bot restarts.
- 100% reliable tool calling with typed arguments and validation errors caught before tool invocation.
- Server administrators can toggle between models (e.g. Gemini 2.5 Flash for speed, GPT-4o for complex reasoning).

### Negative
- Requires maintaining API keys for multiple providers and handling provider-specific rate limit quotas.
