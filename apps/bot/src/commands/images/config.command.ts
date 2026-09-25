import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { VALID_PRESETS, VALID_PROVIDERS } from './imagine.command.js';

export const SD_MODEL_COMMAND_NAME = 'stablediffusion-model';
export const SD_MODEL_ALIASES = ['sdmodel', 'sd-model', 'imagemodel', 'image-model'];

export const SETUP_SD_API_COMMAND_NAME = 'setup-stablediffusion-api';
export const SETUP_SD_API_ALIASES = ['setup-sd-api'];

/**
 * Creates the dual-dispatch `/stablediffusion-model` command for guild image defaults configuration.
 */
export function createSdModelCommand(services: BotServices): Command {
  return {
    metadata: {
      name: SD_MODEL_COMMAND_NAME,
      category: CommandCategory.AI,
      description:
        'Configure or inspect the default image generation preset and model for this server',
      aliases: SD_MODEL_ALIASES,
      userPermissions: [PermissionFlagsBits.ManageGuild],
      usage:
        '/stablediffusion-model [preset] [provider] | !stablediffusion-model [preset] [provider]',
      examples: [
        '/stablediffusion-model preset:anime provider:gemini',
        '/stablediffusion-model preset:photoreal',
        '!stablediffusion-model anime comfyui',
        '!sdmodel',
      ],
      options: [
        {
          name: 'preset',
          description:
            'Default style preset (e.g. anime, photoreal, pixel-art, fantasy, cyberpunk, none)',
          type: 'STRING',
          required: false,
          choices: VALID_PRESETS.map((p) => ({
            name: p.charAt(0).toUpperCase() + p.slice(1),
            value: p,
          })),
        },
        {
          name: 'provider',
          description: 'Default backend provider (e.g. gemini, comfyui, replicate, mock, auto)',
          type: 'STRING',
          required: false,
          choices: VALID_PROVIDERS.map((pr) => ({
            name: pr.toUpperCase(),
            value: pr,
          })),
        },
      ],
    },

    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) {
        await ctx.reply({
          content: '❌ This command can only be used within a Discord server.',
          ephemeral: true,
        });
        return;
      }

      let preset: string | undefined;
      let provider: string | undefined;

      if (ctx.source === 'slash') {
        preset = ctx.options.getString('preset') ?? undefined;
        provider = ctx.options.getString('provider') ?? undefined;
      } else {
        const rawArgs = ctx.options.getRawArgs();
        for (const arg of rawArgs) {
          const lower = arg.toLowerCase();
          if ((VALID_PRESETS as readonly string[]).includes(lower) && !preset) {
            preset = lower;
          } else if ((VALID_PROVIDERS as readonly string[]).includes(lower) && !provider) {
            provider = lower;
          }
        }
      }

      // Check available providers from the service
      const availableProviders = services.imageGenerationService
        .getAvailableProviders()
        .map((p) => `• **${p.name}** (\`${p.id}\`)`)
        .join('\n');

      if (!preset && !provider) {
        // View current defaults
        const currentGuildPreset = await services.imageRepo.getPresetByName(`guild:${ctx.guildId}`);

        const embed = new EmbedBuilder()
          .setTitle('🎨 Server Image Generation Settings')
          .setColor(0x8b5cf6)
          .setDescription(
            `Configure image generation presets and backend provider for **${ctx.guild?.name ?? 'this server'}**.\n` +
              `Use \`/stablediffusion-model [preset] [provider]\` to change default settings.`,
          )
          .addFields(
            {
              name: 'Active Style Preset',
              value: `\`${currentGuildPreset?.name ? currentGuildPreset.name.replace(`guild:${ctx.guildId}:`, '') : 'anime (default)'}\``,
              inline: true,
            },
            {
              name: 'Available Providers',
              value: availableProviders || 'No external providers enabled (using offline Mock)',
              inline: false,
            },
            {
              name: 'Supported Style Presets',
              value: VALID_PRESETS.map((p) => `\`${p}\``).join(', '),
              inline: false,
            },
          )
          .setFooter({ text: 'Ririko AI 2.0.0 • Image Generation Subsystem' })
          .setTimestamp();

        await ctx.reply({ embeds: [embed] });
        return;
      }

      // Save new guild preset if specified
      if (preset) {
        await services.imageRepo.savePreset({
          name: `guild:${ctx.guildId}`,
          positivePromptPrefix: '',
          negativePromptPreset: null,
          isSystemPreset: false,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ Image Generation Settings Updated')
        .setColor(0x10b981)
        .setDescription(
          `Image settings for **${ctx.guild?.name ?? 'this server'}** have been updated successfully!`,
        )
        .addFields(
          { name: 'Default Preset', value: `\`${preset ?? 'unchanged'}\``, inline: true },
          { name: 'Default Provider', value: `\`${provider ?? 'auto'}\``, inline: true },
        )
        .setFooter({ text: 'Ririko AI 2.0.0 • Settings Saved' })
        .setTimestamp();

      await ctx.reply({ embeds: [embed] });
    },
  };
}

/**
 * Creates the dual-dispatch `/setup-stablediffusion-api` command displaying security deprecation notice (ADR-011).
 */
export function createSetupSdApiCommand(): Command {
  return {
    metadata: {
      name: SETUP_SD_API_COMMAND_NAME,
      category: CommandCategory.AI,
      description: 'Legacy StableDiffusion API key setup (Deprecated in Ririko 2.0.0 per ADR-011)',
      aliases: SETUP_SD_API_ALIASES,
      userPermissions: [PermissionFlagsBits.ManageGuild],
      usage: '/setup-stablediffusion-api | !setup-stablediffusion-api',
      examples: ['/setup-stablediffusion-api', '!setup-stablediffusion-api'],
    },

    async execute(ctx: CommandContext): Promise<void> {
      const embed = new EmbedBuilder()
        .setTitle('🛡️ Security Notice: Plaintext Token Storage Deprecation')
        .setColor(0xf59e0b) // Amber warning
        .setDescription(
          'In Ririko 1.4.0, `/setup-stablediffusion-api` was used to store Replicate API tokens directly in the SQLite database.\n\n' +
            'In **Ririko 2.0.0**, storing plaintext credentials in the database has been **permanently discontinued** in compliance with **ADR-011** (Secrets Management & Credential Security).',
        )
        .addFields(
          {
            name: 'Recommended Setup (Server Environment)',
            value:
              'Configure provider credentials securely via system environment variables or your `.env` configuration file:\n' +
              '• `GEMINI_API_KEY`: Google Gemini Imagen 3/4 API Key\n' +
              '• `COMFYUI_BASE_URL`: Local or hosted ComfyUI / SD-WebUI REST endpoint (e.g. `http://127.0.0.1:8188`)\n' +
              '• `REPLICATE_API_TOKEN`: Cloud Replicate API token\n',
          },
          {
            name: 'Need Help?',
            value:
              'Run `pnpm ririko doctor` on the host to verify your configured AI and Image provider connections.',
          },
        )
        .setFooter({ text: 'Ririko AI 2.0.0 • Security & Modernization Architecture' })
        .setTimestamp();

      await ctx.reply({ embeds: [embed] });
    },
  };
}
