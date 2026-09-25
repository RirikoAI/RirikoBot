import { EmbedBuilder, ChannelType } from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
  CommandGuildOnlyError,
} from '@ririko/discord';
import { formatLocalTime } from '@ririko/services';
import type { BotServices } from '../../services.js';

/**
 * Creates the dual-dispatch `/guild-info` command with legacy `!guildinfo`, `!serverinfo`, and `!info` parity.
 */
export function createGuildInfoCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'guild-info',
      category: CommandCategory.UTILITY,
      description: 'Display detailed server information, statistics, and configuration',
      aliases: ['guildinfo', 'server-info', 'serverinfo', 'info'],
      usage: '/guild-info | !guildinfo | !serverinfo',
      examples: ['/guild-info', '!guildinfo', '!serverinfo', '!info'],
      isGuildOnly: true,
    },

    async execute(ctx: CommandContext): Promise<void> {
      const guild = ctx.guild;
      if (!guild) {
        throw new CommandGuildOnlyError('This command can only be used within a server.');
      }

      const [owner, serverTz, serverPrefix] = await Promise.all([
        guild.fetchOwner().catch(() => null),
        services.guildSettingsService.getTimezone(guild.id),
        services.guildSettingsService.getPrefix(guild.id),
      ]);

      const now = new Date();
      const createdUnix = Math.floor(guild.createdTimestamp / 1000);

      // Channel Breakdown
      const channels = guild.channels.cache;
      let textChannels = 0;
      let voiceChannels = 0;
      let categoryChannels = 0;

      for (const channel of channels.values()) {
        if (
          channel.type === ChannelType.GuildText ||
          channel.type === ChannelType.GuildAnnouncement
        ) {
          textChannels++;
        } else if (
          channel.type === ChannelType.GuildVoice ||
          channel.type === ChannelType.GuildStageVoice
        ) {
          voiceChannels++;
        } else if (channel.type === ChannelType.GuildCategory) {
          categoryChannels++;
        }
      }

      // Member Breakdown (cached)
      const totalMembers = guild.memberCount;
      const cachedMembers = Array.from(guild.members.cache.values());
      const cachedBots = cachedMembers.filter((m) => m.user?.bot).length;
      const cachedHumans = cachedMembers.filter((m) => !m.user?.bot).length;

      const rolesCount = guild.roles.cache.size - 1; // Exclude @everyone
      const emojisCount = guild.emojis.cache.size;
      const stickersCount = guild.stickers.cache.size;

      const boostTier = guild.premiumTier;
      const boostCount = guild.premiumSubscriptionCount || 0;

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🏡 ${guild.name}`)
        .setDescription(guild.description || 'No description set.')
        .setThumbnail(guild.iconURL({ size: 1024 }))
        .addFields([
          {
            name: '👑 Server Owner',
            value: owner ? `${owner.user.tag}\n(<@${owner.id}>)` : `<@${guild.ownerId}>`,
            inline: true,
          },
          {
            name: '🆔 Server ID',
            value: `\`${guild.id}\``,
            inline: true,
          },
          {
            name: '⚙️ Command Prefix',
            value: `\`${serverPrefix}\``,
            inline: true,
          },
          {
            name: '🌍 Server Timezone',
            value: `**${serverTz}**\n🕒 \`${formatLocalTime(serverTz, now)}\``,
            inline: true,
          },
          {
            name: '👥 Members',
            value:
              `Total: **${totalMembers.toLocaleString()}**\n` +
              (cachedHumans > 0 || cachedBots > 0
                ? `👤 Humans: **${cachedHumans}** • 🤖 Bots: **${cachedBots}**`
                : `_Cached: ${guild.members.cache.size}_`),
            inline: true,
          },
          {
            name: '💬 Channels',
            value: `Text: **${textChannels}** • Voice: **${voiceChannels}** • Categories: **${categoryChannels}**`,
            inline: true,
          },
          {
            name: '🚀 Boost Status',
            value: `Level **${boostTier}** (${boostCount} boosts)`,
            inline: true,
          },
          {
            name: '🎨 Custom Assets',
            value: `🏷️ Roles: **${rolesCount}**\n😀 Emojis: **${emojisCount}** • Stickers: **${stickersCount}**`,
            inline: true,
          },
          {
            name: '📅 Server Created',
            value: `<t:${createdUnix}:F>\n(<t:${createdUnix}:R>)`,
            inline: true,
          },
        ]);

      if (guild.bannerURL()) {
        embed.setImage(guild.bannerURL({ size: 2048 }));
      }

      embed.setFooter({ text: 'Ririko AI 2.0 • Server Utilities' });
      await ctx.reply({ embeds: [embed] });
    },
  };
}
