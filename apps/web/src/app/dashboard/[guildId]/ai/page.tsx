import type { Metadata } from 'next';
import {
  AI_PROVIDER_LABELS,
  AI_PROVIDER_MODELS,
  AI_SPEAKING_STYLES,
  AI_TOOLS,
  configuredAiProviders,
  MAX_AI_PERSONA_PROMPT_LENGTH,
  parseAiModelChoice,
  type AiProviderId,
} from '@ririko/core';
import { ChannelSelectField } from '@/components/guild-pickers';
import {
  ListField,
  SelectField,
  SettingsForm,
  TextAreaField,
  type SelectOption,
} from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveAiSettings } from './actions';

export const metadata: Metadata = { title: 'AI Chatbot · Ririko Dashboard' };

/** Choices for the configured providers: each provider's default model, then each model. */
function modelOptions(providers: readonly AiProviderId[]): SelectOption[] {
  return providers.flatMap((provider) => {
    const group = AI_PROVIDER_LABELS[provider];
    return [
      { value: provider, label: `${group}: its default model`, group },
      ...AI_PROVIDER_MODELS[provider].map((model) => ({
        value: `${provider}/${model}`,
        label: model,
        group,
      })),
    ];
  });
}

export default async function AiSettingsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { config, guildConfig } = await getWebServices();
  const values = await guildConfig.get(guildId, 'ai');
  const configured = configuredAiProviders(config);

  const options = modelOptions(configured);
  // Keep a saved choice whose provider lost its credentials, so saving does not clear it.
  const saved = parseAiModelChoice(values.model);
  if (values.model && saved && !configured.includes(saved.provider)) {
    options.unshift({ value: values.model, label: `${values.model} (not configured)` });
  }

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">AI Chatbot</h1>
        <p className="mt-1 text-sm text-zinc-400">
          How Ririko chats with members through /ai, /chat and the AI channel.
        </p>
      </header>
      <SettingsForm action={saveAiSettings.bind(null, guildId)}>
        <ChannelSelectField
          guildId={guildId}
          name="channelId"
          label="AI channel"
          description="Ririko answers every message in this channel. Elsewhere, members use /ai or /chat."
          defaultValue={values.channelId}
          emptyLabel="No AI channel"
        />
        <SelectField
          name="speakingStyle"
          label="Speaking style"
          defaultValue={values.speakingStyle}
          options={AI_SPEAKING_STYLES.map((style) => ({ value: style.id, label: style.label }))}
        />
        <TextAreaField
          name="personalityPrompt"
          label="Persona"
          description={`Extra instructions added to Ririko's personality on this server, up to ${MAX_AI_PERSONA_PROMPT_LENGTH} characters. Leave it empty for none.`}
          maxLength={MAX_AI_PERSONA_PROMPT_LENGTH}
          defaultValue={values.personalityPrompt ?? ''}
        />
        <ListField
          name="tools"
          label="Tools"
          description="Actions Ririko may take while chatting. Ririko still checks the member's own permissions before each one. Remove every tool to turn tools off."
          addLabel="Add a tool…"
          defaultValue={values.tools}
          options={AI_TOOLS.map((tool) => ({ value: tool.name, label: tool.label }))}
        />
        <SelectField
          name="model"
          label="Provider and model"
          description={
            configured.length > 0
              ? 'Ririko tries this first. When it is unavailable, Ririko uses another configured provider with that provider’s default model.'
              : 'No AI provider is configured for this bot, so there is nothing to choose.'
          }
          defaultValue={values.model ?? ''}
          emptyLabel="Bot default"
          options={options}
        />
      </SettingsForm>
    </section>
  );
}
