# AI Chatbot 2.0 Subsystem Specification

## 1. Overview & Core Philosophy
Ririko AI 2.0.0 transforms the legacy in-memory chat array into a persistent, multi-provider conversational intelligence engine. It enforces strict context isolation, configurable guild personalities, deterministic utility tools (including an explicit clock tool), and safe tool-calling guardrails as mandated by Sections 11 and 74 of `BLUEPRINT.md`.

---

## 2. Dedicated Channel & Per-User Context Isolation

### 2.1. Dedicated AI Channel (`#ririko-ai`)
- Guild administrators can bind a specific text channel as the dedicated AI channel.
- Messages sent in this channel invoke the AI **without requiring a prefix or mention**.
- Outside the dedicated AI channel, Ririko only responds to explicit `/ai chat` commands or `@Ririko` mentions (if enabled).

### 2.2. Isolated Context in Shared Channels
Although multiple members chat within the same `#ririko-ai` channel, **conversational memory is strictly isolated per user**:
```text
#ririko-ai (Shared Channel)

Alice: "What do you think about Gundam?"
Ririko: [Loads Alice's context] "Gundam is legendary! Are you watching the Universal Century timeline?"

Bob: "Do you remember my favorite anime?"
Ririko: [Loads Bob's context] "You told me earlier that Steins;Gate is your all-time favorite!"
```
- Context queries filter by `(guild_id, user_id, channel_id)`.
- Alice's private thoughts, preferences, and dialogue history are **never leaked** into Bob's context window.

---

## 3. Personality Engine & Identity Safety

### 3.1. Separated Personality Architecture
Guild personality prompts are stored separately from immutable system safety instructions in `ai_guild_preferences`.
- **Default Persona**: Helpful, cheerful, anime-loving companion; speaks casually in American English; occasionally uses playful Japanese expressions (*"Sugoi!"*, *"Yatta!"*); avoids excessive emojis.
- **Customizable**: Guild owners can customize tone and boundaries via the web dashboard.
- **Safe Identity Ingestion**: The AI receives only sanitized public Discord identity tokens (`username`, `display_name`, `server_name`, `joined_date`). Internal database IDs, tokens, and billing details are strictly excluded.

---

## 4. Deterministic Tools & Explicit Time Service

### 4.1. The Time Tool (`get_current_time`)
Large Language Models cannot reliably guess current wall-clock time. Ririko equips the AI with an explicit time tool:
```typescript
export interface TimeToolResult {
  iso: string;
  formatted: string;
  timezone: string;
  utcOffset: string;
}
```
Resolution Precedence:
1. User's explicitly configured personal timezone (`ai_user_preferences.timezone`).
2. Guild's configured server timezone (`guild_settings.timezone`).
3. System default (`UTC`).

### 4.2. Safe Tool Allowlist
The AI is strictly limited to an audited tool allowlist:
- `get_current_time()`: Retrieves accurate time.
- `music.play(query)`: Queues a track in the guild player.
- `economy.check_balance()`: Inspects user wallet and bank.
- `anime.search(title)`: Fetches anime synopsis and score from AniList/MAL.
- `reminders.create(time, message)`: Schedules a real, persistent reminder through `ReminderService` (natural-language times in the user timezone; see `docs/commands.md` §7). Returns the reason when it cannot be scheduled.
- `games.coinflip()`: Flips a random coin.

Each server chooses which of these tools Ririko may use (the dashboard AI Chatbot page, or `ririko guild:config <guild> ai.tools`). The choice is stored in `ai_guild_preferences`:
- `tools_enabled = false` turns every tool off.
- Otherwise `allowed_tools` lists the allowed tools, and an empty list means every tool, including tools added later.

The bot passes the resulting list both to the tool registry (so the model is only told about allowed tools) and to the security interceptor, which refuses any other tool call. An empty list refuses every tool (STORY-116).

---

## 5. Security & Application Mediation Boundaries

In strict compliance with Section 74 of `BLUEPRINT.md`: **The LLM is NEVER the security boundary.**
When the LLM outputs a tool call, the core application mediates and verifies:
1. Does the calling user possess the requisite Discord permission?
2. Is the target module currently enabled for this guild?
3. Does the bot itself have the Discord permissions to execute the action?
4. Does the action violate role hierarchy?

```text
User: "Ban Bob."
  ↓
LLM emits tool call: `moderation.ban(target: Bob)`
  ↓
Application Security Interceptor:
  [X] Does User have BAN_MEMBERS? No.
  ↓
Application blocks execution & returns permission denial to AI.
```

**Strict Prohibition**: The AI model is NEVER granted access to:
- Operating system shell or terminal commands (`exec`, `spawn`).
- Raw database SQL queries or ORM models.
- Local filesystem access.
- Arbitrary HTTP requests (SSRF vector).
- Privileged Discord administrative APIs.

---

## 6. Multi-Provider Architecture

The AI engine uses an abstract provider interface with native streaming support:

```typescript
export interface ChatToken {
  text: string;
  isFinished: boolean;
}

export interface ChatModelProvider {
  readonly id: string;
  readonly name: string;
  
  generate(request: ChatRequest): Promise<ChatResponse>;
  stream?(request: ChatRequest): AsyncIterable<ChatToken>;
}
```

### Supported Providers:
1. **Google Gemini** (`@google/genai`): Default flagship provider (Gemini 2.5 Flash / Pro).
2. **OpenAI** (`openai`): GPT-4o and GPT-4o-mini adapters.
3. **Local Ollama / OpenRouter**: Self-hosted local inference adapter for zero-cost or offline setups.
4. **Fallback Chains**: If the primary provider triggers a 429 quota exhaustion or network timeout, requests automatically route to the configured fallback provider.

### 6.1. Per-Server Provider & Model (STORY-116)
- The provider and model lists live in `@ririko/core` (`AI_PROVIDER_MODELS`). The providers in `@ririko/ai` use the same lists, so the dashboard, the CLI and `/aimodel` offer only models the bot has.
- A server's choice is stored in `ai_guild_preferences.provider_override` and `model_override`. It is written as `provider` (that provider's default model) or `provider/model`, and unset means the bot default (`DEFAULT_AI_PROVIDER`).
- The bot passes the choice to `FallbackChainManager.generate/stream` as a `ProviderPreference`. The chosen provider is tried first. The chosen model is sent only to that provider; if the provider fails, the next provider answers with its own default model. The circuit breaker is unchanged.
- The dashboard offers only providers with credentials (`configuredAiProviders`: `GEMINI_API_KEY`, `OPENAI_API_KEY`, or an explicit `OLLAMA_BASE_URL`). A provider without them is refused on save.
- `/aimodel` and `/ai action:model`:
  - Setting a model needs Manage Server.
  - They accept a listed `provider/model`, a provider name, or a listed model name that belongs to one provider, and `default` to reset.
  - They refuse a provider the bot has not registered as available.
- A `model_override` saved before STORY-116, without a provider, was never used and stays unused. The page shows it as "Bot default".
