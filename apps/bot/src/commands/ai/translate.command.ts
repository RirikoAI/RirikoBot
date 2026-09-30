import { AttachmentBuilder, MessageFlags, type Message } from 'discord.js';
import { preferredAiModel, ValidationError } from '@ririko/core';
import { CommandCategory, type Command } from '@ririko/discord';
import { MAX_TRANSLATION_INPUT_LENGTH, TranslationService } from '@ririko/ai';
import type { BotServices } from '../../services.js';

/** Only text already present in the selected message; never fetch attachments or linked pages. */
export function messageTranslationText(message: Message): string {
  return [
    message.content,
    ...message.embeds.flatMap((embed) => [
      embed.author?.name,
      embed.title,
      embed.description,
      ...embed.fields.flatMap((field) => [field.name, field.value]),
      embed.footer?.text,
    ]),
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join('\n\n')
    .trim();
}

export function createTranslateCommand(
  services: Pick<BotServices, 'fallbackChainManager' | 'conversationManager'>,
): Command {
  const translator = new TranslationService(services.fallbackChainManager);
  return {
    metadata: {
      name: 'translate',
      messageContextMenuName: 'Translate to English',
      category: CommandCategory.AI,
      description: 'Privately translate a selected message and its embed text into English.',
      slashEnabled: false,
      prefixEnabled: false,
      cooldownSeconds: 10,
      usage: 'Right-click a message → Apps → Translate to English',
    },
    async execute(ctx) {
      if (ctx.source !== 'context-menu' || !('targetMessage' in ctx.raw)) return;
      const text = messageTranslationText(ctx.raw.targetMessage);
      if (!text)
        throw new ValidationError(
          'This message has no text to translate. Images and attachments are not supported.',
        );
      if (text.length > MAX_TRANSLATION_INPUT_LENGTH) {
        throw new ValidationError(
          'This message is too long to translate (maximum 12,000 characters).',
        );
      }
      let translated: string;
      try {
        const preferences = ctx.guildId
          ? await services.conversationManager.getGuildPreferences(ctx.guildId)
          : null;
        translated = await translator.translateToEnglish(text, preferredAiModel(preferences));
      } catch {
        await ctx.editReply({
          content:
            'Translation is unavailable right now. Please try again later or ask an admin to check the AI provider configuration.',
          allowedMentions: { parse: [] },
        });
        return;
      }
      await ctx.editReply(
        translated.length <= 2000
          ? {
              content: translated,
              allowedMentions: { parse: [] },
              flags: MessageFlags.SuppressEmbeds,
            }
          : {
              content: 'Your English translation is attached.',
              files: [
                new AttachmentBuilder(Buffer.from(translated, 'utf8'), {
                  name: 'translation-en.txt',
                }),
              ],
              allowedMentions: { parse: [] },
            },
      );
    },
  };
}
