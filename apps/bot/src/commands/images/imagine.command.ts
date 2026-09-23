import {
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type Message,
  type MessageComponentInteraction,
} from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { ImageAspectRatio } from '@ririko/services';
import type { BotServices } from '../../services.js';
import { attachOwnerCollector } from '../shared/owner-collector.js';

export const IMAGINE_COMMAND_NAME = 'imagine';
export const IMAGINE_ALIASES = ['img', 'ai-image', 'generate-image'];

export const VALID_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
export const VALID_PRESETS = ['anime', 'photoreal', 'pixel-art', 'fantasy', 'cyberpunk', 'none'] as const;
export const VALID_PROVIDERS = ['auto', 'gemini', 'comfyui', 'replicate', 'mock'] as const;

export interface ParsedImagineArgs {
  prompt: string;
  negativePrompt?: string | undefined;
  aspectRatio?: ImageAspectRatio | undefined;
  preset?: string | undefined;
  provider?: string | undefined;
}

/**
 * Parses raw prefix arguments supporting flags:
 * --ar / --aspect <ratio>
 * --preset / --style <preset>
 * --provider / --backend <provider>
 * --negative / --neg / --no <negative prompt text>
 */
export function parseImaginePrefixArgs(rawArgs: readonly string[]): ParsedImagineArgs {
  if (rawArgs.length === 0) {
    return {
      prompt: '',
      negativePrompt: undefined,
      aspectRatio: undefined,
      preset: undefined,
      provider: undefined,
    };
  }

  const promptTokens: string[] = [];
  const negativeTokens: string[] = [];
  let aspectRatio: ImageAspectRatio | undefined;
  let preset: string | undefined;
  let provider: string | undefined;

  let currentFlag: 'prompt' | 'negative' = 'prompt';

  for (let i = 0; i < rawArgs.length; i++) {
    const token = rawArgs[i]!;
    const lower = token.toLowerCase();

    if (lower === '--ar' || lower === '--aspect' || lower === '--aspect-ratio') {
      const next = rawArgs[i + 1];
      if (next && (VALID_ASPECT_RATIOS as readonly string[]).includes(next)) {
        aspectRatio = next as ImageAspectRatio;
        i++;
      }
      currentFlag = 'prompt';
      continue;
    }

    if (lower === '--preset' || lower === '--style') {
      const next = rawArgs[i + 1]?.toLowerCase();
      if (next && (VALID_PRESETS as readonly string[]).includes(next)) {
        preset = next;
        i++;
      }
      currentFlag = 'prompt';
      continue;
    }

    if (lower === '--provider' || lower === '--backend') {
      const next = rawArgs[i + 1]?.toLowerCase();
      if (next && (VALID_PROVIDERS as readonly string[]).includes(next)) {
        provider = next;
        i++;
      }
      currentFlag = 'prompt';
      continue;
    }

    if (lower === '--negative' || lower === '--neg' || lower === '--no') {
      currentFlag = 'negative';
      continue;
    }

    if (token.startsWith('--')) {
      // Unknown flag, reset flag mode and continue
      currentFlag = 'prompt';
      continue;
    }

    if (currentFlag === 'negative') {
      negativeTokens.push(token);
    } else {
      promptTokens.push(token);
    }
  }

  return {
    prompt: promptTokens.join(' ').trim(),
    negativePrompt: negativeTokens.length > 0 ? negativeTokens.join(' ').trim() : undefined,
    aspectRatio,
    preset,
    provider,
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function getImageAttachmentName(mimeType?: string): string {
  if (!mimeType) return 'imagine.png';
  if (mimeType.includes('webp')) return 'imagine.webp';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'imagine.jpg';
  if (mimeType.includes('gif')) return 'imagine.gif';
  return 'imagine.png';
}

export function buildImagineActionRow(jobId: string, userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`imagine:regen:${jobId}`)
      .setLabel('Regenerate')
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`imagine:dismiss:${userId}`)
      .setLabel('Dismiss')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * Handles button interactions (Regenerate & Dismiss) for /imagine command.
 */
export async function handleImagineButtonInteraction(
  interaction: ButtonInteraction,
  services: BotServices,
): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith('imagine:dismiss:')) {
    const ownerId = customId.replace('imagine:dismiss:', '');
    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: '❌ Only the person who requested this image can dismiss it.',
        ephemeral: true,
      });
      return;
    }

    await interaction.message.delete().catch(() => undefined);
    return;
  }

  if (customId.startsWith('imagine:regen:')) {
    const jobId = customId.replace('imagine:regen:', '');
    const originalJob = await services.imageRepo.findById(jobId);

    if (!originalJob) {
      await interaction.reply({
        content: '❌ Original image job information could not be found to regenerate.',
        ephemeral: true,
      });
      return;
    }

    if (originalJob.userId && originalJob.userId !== interaction.user.id) {
      await interaction.reply({
        content: '❌ Only the person who requested this image can regenerate it.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    try {
      const result = await services.imageGenerationService.generateImage({
        prompt: originalJob.prompt,
        negativePrompt: originalJob.negativePrompt ?? undefined,
        aspectRatio: '1:1',
        providerId: originalJob.providerId ?? undefined,
        userId: interaction.user.id,
        guildId: interaction.guildId ?? undefined,
      });

      const primaryImage = result.images[0];
      if (!primaryImage) {
        throw new Error('No images were returned by the provider.');
      }

      const fileName = getImageAttachmentName(primaryImage.mimeType);
      const attachment = new AttachmentBuilder(primaryImage.buffer, { name: fileName });
      const durationSec = (result.durationMs / 1000).toFixed(1);

      const embed = new EmbedBuilder()
        .setTitle(`🎨 ${truncate(result.prompt, 100)}`)
        .setDescription(
          `**Prompt:** ${result.prompt}` +
            (result.negativePrompt ? `\n**Negative:** ${result.negativePrompt}` : ''),
        )
        .setImage(`attachment://${fileName}`)
        .setColor(0x8b5cf6)
        .addFields(
          { name: 'Provider', value: `\`${result.providerName ?? result.providerId}\``, inline: true },
          { name: 'Preset', value: `\`${result.preset ?? 'anime'}\``, inline: true },
          { name: 'Aspect Ratio', value: `\`${result.aspectRatio ?? '1:1'}\``, inline: true },
          { name: 'Generation Time', value: `\`${durationSec}s\``, inline: true },
        )
        .setFooter({ text: `Requested by ${interaction.user.username} • Ririko AI Imagen` })
        .setTimestamp();

      const actionRow = buildImagineActionRow(result.jobId ?? jobId, interaction.user.id);

      await interaction.editReply({
        embeds: [embed],
        files: [attachment],
        components: [actionRow],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await interaction.followUp({
        content: `❌ Regeneration failed: ${message}`,
        ephemeral: true,
      });
    }
  }
}

/**
 * Creates the dual-dispatch `/imagine` command with Slash & Prefix parity.
 */
export function createImagineCommand(services: BotServices): Command {
  return {
    metadata: {
      name: IMAGINE_COMMAND_NAME,
      category: CommandCategory.AI,
      description: 'Generate high-quality AI images using Gemini Imagen, ComfyUI, or Replicate',
      aliases: IMAGINE_ALIASES,
      usage:
        '/imagine prompt:<prompt> [aspect_ratio] [preset] [negative_prompt] [provider] | !imagine <prompt> [--ar 16:9] [--preset anime] [--negative ...]',
      examples: [
        '/imagine prompt:A futuristic anime city with neon lights aspect_ratio:16:9 preset:cyberpunk',
        '!imagine a magical forest glowing at night --ar 16:9 --preset fantasy',
        '!imagine cute anime girl with blue ribbons --preset anime --negative blurry, low quality',
        '!imagine cybernetic samurai --provider comfyui --ar 1:1',
      ],
      cooldownSeconds: 5,
      options: [
        {
          name: 'prompt',
          description: 'The description of the image to generate',
          type: 'STRING',
          required: true,
        },
        {
          name: 'preset',
          description: 'Style preset to enhance prompt (default: anime)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Anime (Default)', value: 'anime' },
            { name: 'Photorealistic', value: 'photoreal' },
            { name: 'Pixel Art', value: 'pixel-art' },
            { name: 'Fantasy / Concept Art', value: 'fantasy' },
            { name: 'Cyberpunk / Sci-Fi', value: 'cyberpunk' },
            { name: 'None (Raw Prompt)', value: 'none' },
          ],
        },
        {
          name: 'aspect_ratio',
          description: 'Aspect ratio of the generated image (default: 1:1)',
          type: 'STRING',
          required: false,
          choices: [
            { name: '1:1 (Square)', value: '1:1' },
            { name: '16:9 (Landscape)', value: '16:9' },
            { name: '9:16 (Portrait)', value: '9:16' },
            { name: '4:3 (Landscape)', value: '4:3' },
            { name: '3:4 (Portrait)', value: '3:4' },
          ],
        },
        {
          name: 'negative_prompt',
          description: 'Things to exclude from the generated image',
          type: 'STRING',
          required: false,
        },
        {
          name: 'provider',
          description: 'AI backend provider to use (default: auto)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Auto (Best Available)', value: 'auto' },
            { name: 'Google Gemini Imagen', value: 'gemini' },
            { name: 'Local ComfyUI / SD-WebUI', value: 'comfyui' },
            { name: 'Replicate', value: 'replicate' },
            { name: 'Mock (Offline Synthesizer)', value: 'mock' },
          ],
        },
      ],
    },

    async execute(ctx: CommandContext): Promise<void> {
      let prompt: string;
      let negativePrompt: string | undefined;
      let aspectRatio: ImageAspectRatio | undefined;
      let preset: string | undefined;
      let provider: string | undefined;

      if (ctx.source === 'slash') {
        prompt = (ctx.options.getString('prompt', true) ?? '').trim();
        negativePrompt = ctx.options.getString('negative_prompt') ?? undefined;
        aspectRatio = (ctx.options.getString('aspect_ratio') as ImageAspectRatio) ?? undefined;
        preset = ctx.options.getString('preset') ?? undefined;
        provider = ctx.options.getString('provider') ?? undefined;
      } else {
        const rawArgs = ctx.options.getRawArgs();
        const parsed = parseImaginePrefixArgs(rawArgs);
        prompt = parsed.prompt;
        negativePrompt = parsed.negativePrompt;
        aspectRatio = parsed.aspectRatio;
        preset = parsed.preset;
        provider = parsed.provider;
      }

      if (!prompt) {
        await ctx.reply({
          content:
            '❌ Please provide a prompt for image generation!\n' +
            '• Slash example: `/imagine prompt:a cute anime cat with wizard hat aspect_ratio:16:9`\n' +
            `• Prefix example: \`${ctx.invokedPrefix}imagine a cute anime cat with wizard hat --ar 16:9 --preset anime\``,
          ephemeral: true,
        });
        return;
      }

      await ctx.deferReply();

      try {
        const result = await services.imageGenerationService.generateImage({
          prompt,
          negativePrompt,
          aspectRatio: aspectRatio ?? '1:1',
          preset,
          providerId: provider,
          userId: ctx.user.id,
          guildId: ctx.guildId ?? undefined,
        });

        const primaryImage = result.images[0];
        if (!primaryImage) {
          throw new Error('No images were returned by the provider.');
        }

        const fileName = getImageAttachmentName(primaryImage.mimeType);
        const attachment = new AttachmentBuilder(primaryImage.buffer, { name: fileName });
        const durationSec = (result.durationMs / 1000).toFixed(1);

        const embed = new EmbedBuilder()
          .setTitle(`🎨 ${truncate(result.prompt, 100)}`)
          .setDescription(
            `**Prompt:** ${result.prompt}` +
              (result.negativePrompt ? `\n**Negative:** ${result.negativePrompt}` : ''),
          )
          .setImage(`attachment://${fileName}`)
          .setColor(0x8b5cf6)
          .addFields(
            { name: 'Provider', value: `\`${result.providerName ?? result.providerId}\``, inline: true },
            { name: 'Preset', value: `\`${result.preset ?? preset ?? 'anime'}\``, inline: true },
            { name: 'Aspect Ratio', value: `\`${result.aspectRatio ?? aspectRatio ?? '1:1'}\``, inline: true },
            { name: 'Generation Time', value: `\`${durationSec}s\``, inline: true },
          )
          .setFooter({ text: `Requested by ${ctx.user.username} • Ririko AI Imagen` })
          .setTimestamp();

        const actionRow = buildImagineActionRow(result.jobId ?? 'job-default', ctx.user.id);

        const message = (await ctx.editReply({
          embeds: [embed],
          files: [attachment],
          components: [actionRow],
        })) as Message;

        attachOwnerCollector(message, {
          ownerId: ctx.user.id,
          customIds: [`imagine:regen:${result.jobId ?? 'job-default'}`, `imagine:dismiss:${ctx.user.id}`],
          notOwnerHint: '⏳ Only the requester can control this image.',
          onCollect: async (interaction: MessageComponentInteraction) => {
            if (interaction.isButton()) {
              await handleImagineButtonInteraction(interaction, services);
            }
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await ctx.editReply({
          content: `❌ Image generation failed: ${message}`,
          embeds: [],
          components: [],
        });
      }
    },
  };
}
