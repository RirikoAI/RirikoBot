import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { IMAGE_PROVIDER_IDS, IMAGE_STYLE_PRESET_IDS } from '@ririko/core';

/** Providers a server may choose; `auto` resets to the bot default. */
const SERVER_PROVIDER_CHOICES: string[] = [...IMAGE_PROVIDER_IDS, 'auto'];

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
      registrationScope: 'guild',
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
          choices: IMAGE_STYLE_PRESET_IDS.map((p) => ({
            name: p.charAt(0).toUpperCase() + p.slice(1),
            value: p,
          })),
        },
        {
          name: 'provider',
          description:
            'Default backend provider (gemini, replicate, comfyui; auto for the bot default)',
          type: 'STRING',
          required: false,
          choices: SERVER_PROVIDER_CHOICES.map((pr) => ({
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
        for (const arg of ctx.options.getRawArgs()) {
          const lower = arg.toLowerCase();
          if ((IMAGE_STYLE_PRESET_IDS as readonly string[]).includes(lower) && !preset) {
            preset = lower;
          } else if (SERVER_PROVIDER_CHOICES.includes(lower) && !provider) {
            provider = lower;
          }
        }
      }

      const current = await services.imageRepo.getGuildSettings(ctx.guildId);
      const available = services.imageGenerationService.getAvailableProviders();

      if (!preset && !provider) {
        const providerList = available
          .filter((p) => p.id !== 'mock')
          .map((p) => `• **${p.name}** (\`${p.id}\`)`)
          .join('\n');
        const embed = new EmbedBuilder()
          .setTitle('🎨 Server Image Generation Settings')
          .setColor(0x8b5cf6)
          .setDescription(
            `Defaults /imagine uses in **${ctx.guild?.name ?? 'this server'}** when a member picks none.\n` +
              `Use \`/stablediffusion-model [preset] [provider]\` to change them, or the dashboard.`,
          )
          .addFields(
            {
              name: 'Default Style Preset',
              value: `\`${current?.defaultPreset ?? 'anime (default)'}\``,
              inline: true,
            },
            {
              name: 'Default Provider',
              value: `\`${current?.defaultProvider ?? 'auto (bot default)'}\``,
              inline: true,
            },
            {
              name: 'Images per Member (24 hours)',
              value: current?.memberDailyLimit
                ? `${current.memberDailyLimit} (and the bot quota)`
                : 'Bot quota only',
              inline: true,
            },
            {
              name: 'Available Providers',
              value:
                providerList || 'No image provider is configured (images use the offline mock).',
              inline: false,
            },
            {
              name: 'Supported Style Presets',
              value: IMAGE_STYLE_PRESET_IDS.map((id) => `\`${id}\``).join(', '),
              inline: false,
            },
          )
          .setFooter({ text: 'Ririko AI 2.0.0 • Image Generation Subsystem' })
          .setTimestamp();

        await ctx.reply({ embeds: [embed] });
        return;
      }

      if (provider && provider !== 'auto' && !available.some((p) => p.id === provider)) {
        await ctx.reply({
          content: `❌ \`${provider}\` is not configured for this bot. Run the command without options to see the providers you can use.`,
        });
        return;
      }

      const saved = await services.imageRepo.saveGuildSettings({
        guildId: ctx.guildId,
        defaultProvider:
          provider === undefined
            ? (current?.defaultProvider ?? null)
            : provider === 'auto'
              ? null
              : provider,
        memberDailyLimit: current?.memberDailyLimit ?? null,
        defaultPreset: preset ?? current?.defaultPreset ?? null,
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Image Generation Settings Updated')
        .setColor(0x10b981)
        .setDescription(
          `Image settings for **${ctx.guild?.name ?? 'this server'}** have been updated successfully!`,
        )
        .addFields(
          {
            name: 'Default Preset',
            value: `\`${saved.defaultPreset ?? 'anime (default)'}\``,
            inline: true,
          },
          {
            name: 'Default Provider',
            value: `\`${saved.defaultProvider ?? 'auto (bot default)'}\``,
            inline: true,
          },
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
      registrationScope: 'guild',
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
