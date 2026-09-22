import {
  EmbedBuilder,
  PermissionsBitField,
} from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
  CommandGuildOnlyError,
  CommandPermissionError,
} from '@ririko/discord';
import {
  canonicalTimeZone,
  formatLocalTime,
} from '@ririko/services';
import { ValidationError } from '@ririko/core';
import type { BotServices } from '../../services.js';

/**
 * Creates the dual-dispatch `/timezone` and `!timezone` command.
 * Allows viewing or setting the server-wide timezone and personal timezone overrides.
 * Enforces the unified fallback: User Preference -> Server Timezone -> UTC.
 */
export function createTimezoneCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'timezone',
      category: CommandCategory.UTILITY,
      description: 'View or configure the server timezone or your personal timezone override',
      aliases: ['tz', 'settimezone', 'set-timezone'],
      usage: '/timezone [set:<zone>] [scope:<server|user>] | !timezone [zone] | !tz user <zone> | !tz server <zone>',
      examples: [
        '/timezone',
        '/timezone set:Asia/Kuala_Lumpur scope:server',
        '/timezone set:America/New_York scope:user',
        '!timezone',
        '!tz Asia/Tokyo',
        '!tz server Europe/London',
        '!tz user America/Los_Angeles',
      ],
      options: [
        {
          name: 'set',
          description: 'IANA timezone name (e.g. Asia/Kuala_Lumpur, America/New_York, Europe/London, UTC)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'scope',
          description: 'Apply timezone to the entire server or your personal account',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Server (Server-wide default for this guild)', value: 'server' },
            { name: 'User (Personal override for yourself)', value: 'user' },
          ],
        },
      ],
    },

    async execute(ctx: CommandContext): Promise<void> {
      let requestedZone: string | undefined;
      let requestedScope: 'server' | 'user' | undefined;

      if (ctx.source === 'prefix') {
        const rawArgs = ctx.options.getRawArgs();
        if (rawArgs.length > 0) {
          const first = rawArgs[0]!.toLowerCase();
          if (first === 'user' || first === 'me' || first === 'personal') {
            requestedScope = 'user';
            requestedZone = rawArgs.slice(1).join('_').trim();
          } else if (first === 'server' || first === 'guild') {
            requestedScope = 'server';
            requestedZone = rawArgs.slice(1).join('_').trim();
          } else {
            // General argument: !tz Asia/Tokyo
            requestedZone = rawArgs.join('_').trim();
            // In a guild: default to server if admin, otherwise user
            if (ctx.guild && ctx.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
              requestedScope = 'server';
            } else {
              requestedScope = 'user';
            }
          }
        }
      } else {
        requestedZone = ctx.options.getString('set') ?? undefined;
        const scopeOpt = ctx.options.getString('scope');
        if (scopeOpt === 'server' || scopeOpt === 'user') {
          requestedScope = scopeOpt;
        } else {
          requestedScope = ctx.guild ? 'server' : 'user';
        }
      }

      // 1. VIEW MODE: No zone argument provided
      if (!requestedZone) {
        const [userPrefs, serverTz] = await Promise.all([
          services.conversationManager.getUserPreferences(ctx.user.id).catch(() => null),
          ctx.guild ? services.guildSettingsService.getTimezone(ctx.guild.id) : null,
        ]);

        const userTz = userPrefs?.timezone;
        const effectiveTz = userTz || serverTz || 'UTC';
        const now = new Date();

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🌍 Timezone Configuration')
          .setDescription(
            `Time-sensitive commands in Ririko automatically fall back through this hierarchy:\n` +
              `**1. User Preference** ➔ **2. Server Timezone** ➔ **3. UTC**`,
          );

        if (ctx.guild) {
          embed.addFields([
            {
              name: '🏠 Server Timezone',
              value: `**${serverTz || 'UTC'}**\n🕒 Current time: \`${formatLocalTime(serverTz || 'UTC', now)}\``,
              inline: true,
            },
          ]);
        }

        embed.addFields([
          {
            name: '👤 Your Personal Timezone',
            value: userTz
              ? `**${userTz}**\n🕒 Current time: \`${formatLocalTime(userTz, now)}\``
              : `_Not set_\n🕒 Inheriting: **${serverTz || 'UTC'}**`,
            inline: true,
          },
          {
            name: '⚡ Effective Active Timezone',
            value: `**${effectiveTz}** (\`${formatLocalTime(effectiveTz, now)}\`)`,
            inline: false,
          },
          {
            name: '💡 How to Change',
            value:
              `• **Set Server Timezone:** \`/timezone set:<zone> scope:server\` or \`!tz server <zone>\` *(requires Manage Server)*\n` +
              `• **Set Personal Timezone:** \`/timezone set:<zone> scope:user\` or \`!tz user <zone>\`\n` +
              `• **Supported Format:** Standard IANA names such as \`Asia/Kuala_Lumpur\`, \`America/New_York\`, \`Europe/London\`, \`Asia/Tokyo\`, \`UTC\`.`,
          },
        ]);

        embed.setFooter({ text: 'Ririko AI 2.0 • Server Utilities' });
        await ctx.reply({ embeds: [embed] });
        return;
      }

      // 2. SET MODE: Validate IANA timezone name
      const canonical = canonicalTimeZone(requestedZone);
      if (!canonical) {
        throw new ValidationError(`Invalid IANA timezone: "${requestedZone}"`, {
          userMessage:
            `❌ \`${requestedZone}\` is not a valid IANA timezone name.\n\n` +
            `Please specify a standard geographic IANA name, for example:\n` +
            `• \`Asia/Kuala_Lumpur\`\n` +
            `• \`Asia/Tokyo\`\n` +
            `• \`America/New_York\`\n` +
            `• \`America/Los_Angeles\`\n` +
            `• \`Europe/London\`\n` +
            `• \`UTC\`\n\n` +
            `*(Note: Fixed abbreviations like EST, GMT+8 are rejected because they do not account for Daylight Saving Time).*`,
        });
      }

      // 2A. SET SERVER TIMEZONE
      if (requestedScope === 'server') {
        if (!ctx.guild) {
          throw new CommandGuildOnlyError(
            'The server timezone can only be set within a Discord server.',
          );
        }

        const member = ctx.member;
        const hasPermission =
          member && member.permissions.has(PermissionsBitField.Flags.ManageGuild);

        if (!hasPermission) {
          throw new CommandPermissionError(
            'You need the **Manage Server** permission to update the server-wide timezone.\n' +
              `To configure your own personal timezone override instead, use: \`/timezone set:${canonical} scope:user\` or \`!tz user ${canonical}\`.`,
            {
              missingPermissions: ['ManageGuild'],
              missingFor: 'user',
            },
          );
        }

        await services.guildSettingsService.setTimezone(ctx.guild.id, canonical);
        const now = new Date();

        const embed = new EmbedBuilder()
          .setColor(0x57f287) // Success Green
          .setTitle('✅ Server Timezone Updated')
          .setDescription(
            `The default server timezone for **${ctx.guild.name}** has been set to: **${canonical}**\n\n` +
              `🕒 **Current Server Time:** \`${formatLocalTime(canonical, now)}\`\n\n` +
              `All time-sensitive commands in this server (e.g. reminders, AI current time queries, scheduled events) without individual user overrides will now resolve in this timezone.`,
          )
          .setFooter({ text: 'Ririko AI 2.0 • Server Utilities' });

        await ctx.reply({ embeds: [embed] });
        return;
      }

      // 2B. SET PERSONAL USER TIMEZONE
      await services.conversationManager.setUserPreferences(ctx.user.id, {
        timezone: canonical,
      });
      const now = new Date();

      const embed = new EmbedBuilder()
        .setColor(0x57f287) // Success Green
        .setTitle('✅ Personal Timezone Updated')
        .setDescription(
          `Your personal timezone has been set to: **${canonical}**\n\n` +
            `🕒 **Current Local Time:** \`${formatLocalTime(canonical, now)}\`\n\n` +
            `Your natural language reminders (\`/reminder\`, \`!remindme\`) and AI conversations will now prioritize this timezone across all servers.`,
        )
        .setFooter({ text: 'Ririko AI 2.0 • User Utilities' });

      await ctx.reply({ embeds: [embed] });
    },
  };
}
