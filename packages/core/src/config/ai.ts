/**
 * AI chat options shared by the bot, the dashboard and `ririko guild:config`: providers and
 * their models, speaking styles and tools. `@ririko/ai` builds its providers and tools from
 * these lists, so a choice offered here always exists in the bot.
 */

export const AI_PROVIDER_IDS = ['gemini', 'openai', 'ollama'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  ollama: 'Ollama (local)',
};

/** Models each provider may be asked for. The first one is the provider's default. */
export const AI_PROVIDER_MODELS = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.5-flash-lite', 'gemini-3.7-flash'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
  ollama: ['llama3.3', 'llama3.2', 'mistral', 'qwen2.5', 'deepseek-r1'],
} as const satisfies Record<AiProviderId, readonly string[]>;

/**
 * Provider and model a guild prefers, written `provider` (its default model) or
 * `provider/model`. Only listed models are allowed: a model a provider rejects would put that
 * provider in cooldown for every guild.
 */
export const AI_MODEL_CHOICES = AI_PROVIDER_IDS.flatMap((provider) => [
  provider,
  ...AI_PROVIDER_MODELS[provider].map((model) => `${provider}/${model}`),
]) as [string, ...string[]];

export interface AiModelChoice {
  provider: AiProviderId;
  model: string | null;
}

/** Splits `provider/model` (or `provider`); `null` for anything that is not a listed choice. */
export function parseAiModelChoice(value: string | null | undefined): AiModelChoice | null {
  if (!value || !AI_MODEL_CHOICES.includes(value)) return null;
  const [provider, model] = value.split('/') as [AiProviderId, string | undefined];
  return { provider, model: model ?? null };
}

/** The stored provider and model as a choice; `null` when unset or no longer listed. */
export function formatAiModelChoice(
  provider: string | null | undefined,
  model: string | null | undefined,
): string | null {
  if (!provider) return null;
  const value = model ? `${provider}/${model}` : provider;
  return AI_MODEL_CHOICES.includes(value) ? value : null;
}

/**
 * Reads a model choice typed in Discord: `provider`, `provider/model` or a listed model name.
 * `null` for `default` (clear the choice), `undefined` when it is not a listed choice.
 */
export function readAiModelChoice(input: string): string | null | undefined {
  const text = input.trim().toLowerCase();
  if (text === 'default' || text === 'none' || text === 'reset') return null;
  if (AI_MODEL_CHOICES.includes(text)) return text;
  const owners = AI_PROVIDER_IDS.filter((provider) =>
    (AI_PROVIDER_MODELS[provider] as readonly string[]).includes(text),
  );
  return owners.length === 1 ? `${owners[0]}/${text}` : undefined;
}

export const AI_SPEAKING_STYLES = [
  { id: 'FRIENDLY_ANIME', label: 'Friendly Anime (Default)' },
  { id: 'TSUNDERE', label: 'Tsundere' },
  { id: 'KUUDERE', label: 'Kuudere' },
  { id: 'DANDERE', label: 'Dandere' },
  { id: 'GENKI', label: 'Genki' },
  { id: 'FORMAL', label: 'Formal / Professional' },
] as const;
export type AiSpeakingStyle = (typeof AI_SPEAKING_STYLES)[number]['id'];
export const DEFAULT_AI_SPEAKING_STYLE: AiSpeakingStyle = 'FRIENDLY_ANIME';

/** Longest custom persona prompt; the personality engine cuts anything longer. */
export const MAX_AI_PERSONA_PROMPT_LENGTH = 1500;

/** Tools the model may call, by tool name. */
export const AI_TOOLS = [
  { name: 'get_current_time', label: 'Current time' },
  { name: 'games.coinflip', label: 'Coin flip' },
  { name: 'anime.search', label: 'Anime search' },
  { name: 'economy.check_balance', label: 'Check a balance' },
  { name: 'music.play', label: 'Play music' },
  { name: 'reminders.create', label: 'Create a reminder' },
] as const;
export type AiToolName = (typeof AI_TOOLS)[number]['name'];
export const AI_TOOL_NAMES = AI_TOOLS.map((tool) => tool.name) as [AiToolName, ...AiToolName[]];

/** The provider (and model) a guild prefers, as stored; empty when it has no valid choice. */
export function preferredAiModel(
  stored: { providerOverride?: string | null; modelOverride?: string | null } | null | undefined,
): { providerId?: AiProviderId; model?: string } {
  const choice = parseAiModelChoice(
    formatAiModelChoice(stored?.providerOverride, stored?.modelOverride),
  );
  if (!choice) return {};
  return choice.model
    ? { providerId: choice.provider, model: choice.model }
    : { providerId: choice.provider };
}

/** How `ai_guild_preferences` stores a guild's tools. */
export interface StoredAiTools {
  toolsEnabled?: boolean | null | undefined;
  allowedTools?: readonly string[] | null | undefined;
}

/**
 * Tools a guild allows: `undefined` for every tool, otherwise the listed ones (empty when the
 * guild turned tools off). The bot passes this to the tool registry and the security check.
 */
export function allowedAiTools(stored: StoredAiTools | null | undefined): string[] | undefined {
  if (stored?.toolsEnabled === false) return [];
  const listed = stored?.allowedTools ?? [];
  return listed.length > 0 ? [...listed] : undefined;
}

/** Credentials that make each provider usable, from the shared environment config. */
export interface AiProviderEnv {
  GEMINI_API_KEY?: string | undefined;
  OPENAI_API_KEY?: string | undefined;
  OLLAMA_BASE_URL?: string | undefined;
}

/**
 * Providers that have credentials (or, for Ollama, an explicit server address). Only these are
 * offered on the dashboard; the values themselves never leave the server.
 */
export function configuredAiProviders(env: AiProviderEnv): AiProviderId[] {
  const configured: Record<AiProviderId, boolean> = {
    gemini: Boolean(env.GEMINI_API_KEY),
    openai: Boolean(env.OPENAI_API_KEY),
    ollama: Boolean(env.OLLAMA_BASE_URL),
  };
  return AI_PROVIDER_IDS.filter((provider) => configured[provider]);
}
