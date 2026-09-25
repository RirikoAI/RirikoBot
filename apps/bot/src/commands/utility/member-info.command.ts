import { EmbedBuilder, PermissionsBitField, type User } from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
  CommandGuildOnlyError,
} from '@ririko/discord';
import { formatLocalTime } from '@ririko/services';
import type { BotServices } from '../../services.js';

/**
 * Creates the dual-dispatch `/member-info` command with legacy `!memberinfo`, `!userinfo`, and `!whois` parity.
 */
export function createMemberInfoCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'member-info',
      category: CommandCategory.UTILITY,
      description: 'Display detailed member profile, roles, permissions, and timezone information',
      aliases: ['memberinfo', 'user-info', 'userinfo', 'whois'],
      usage:
        '/member-info [user:<target>] | !memberinfo [@user|id] | !userinfo [@user] | !whois [@user]',
      examples: [
        '/member-info',
        '/member-info user:@Ririko',
        '!memberinfo',
        '!userinfo @Ririko',
        '!whois',
      ],
      options: [
        {
          name: 'user',
          description: 'The member to inspect (defaults to yourself)',
          type: 'USER',
          required: false,
        },
      ],
      isGuildOnly: true,
    },

    async execute(ctx: CommandContext): Promise<void> {
      const guild = ctx.guild;
      if (!guild) {
        throw new CommandGuildOnlyError('This command can only be used within a server.');
      }

      let targetUser: User = ctx.user;

      if (ctx.source === 'slash') {
        const optUser = await ctx.options.getUser('user');
        if (optUser) {
          targetUser = optUser;
        }
      } else {
        const rawArgs = ctx.options.getRawArgs();
        const mentions = (ctx.raw as { mentions?: { users?: Map<string, User> } })?.mentions?.users;
        const firstMention = mentions ? Array.from(mentions.values())[0] : undefined;

        if (firstMention) {
          targetUser = firstMention;
        } else if (rawArgs.length > 0) {
          const possibleId = rawArgs[0]!.replace(/[<@!>]/g, '');
          if (/^\d{17,20}$/.test(possibleId)) {
            const fetched = await ctx.client.users.fetch(possibleId).catch(() => null);
            if (fetched) {
              targetUser = fetched;
            }
          }
        }
      }

      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        await ctx.reply({
          content: `❌ Could not find member **${targetUser.tag}** in this server.`,
          ephemeral: true,
        });
        return;
      }

      const [effectiveTz, economyBal, xpProfile] = await Promise.all([
        services.resolveUserTimeZone(targetUser.id, guild.id),
        services.economyRepo.findById(targetUser.id).catch(() => null),
        services.xpRepo.findById({ userId: targetUser.id, guildId: guild.id }).catch(() => null),
      ]);

      const now = new Date();
      const createdUnix = Math.floor(targetUser.createdTimestamp / 1000);
      const joinedUnix = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

      // Roles list (highest to lowest, excluding @everyone)
      const nonEveryoneRoles = Array.from(member.roles.cache.values())
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => (b.position ?? 0) - (a.position ?? 0));

      const roleMentions = nonEveryoneRoles.map((r) => `<@&${r.id}>`);
      let rolesDisplay = 'No roles';
      if (roleMentions.length > 0) {
        if (roleMentions.length > 15) {
          rolesDisplay = `${roleMentions.slice(0, 15).join(' ')} *(+${roleMentions.length - 15} more)*`;
        } else {
          rolesDisplay = roleMentions.join(' ');
        }
      }

      // Key permissions badges
      const keyPermissions: string[] = [];
      const perms = member.permissions;

      if (perms.has(PermissionsBitField.Flags.Administrator)) {
        keyPermissions.push('👑 Administrator');
      }
      if (perms.has(PermissionsBitField.Flags.ManageGuild)) {
        keyPermissions.push('⚙️ Manage Server');
      }
      if (perms.has(PermissionsBitField.Flags.ModerateMembers)) {
        keyPermissions.push('🛡️ Timeout Members');
      }
      if (perms.has(PermissionsBitField.Flags.KickMembers)) {
        keyPermissions.push('👢 Kick Members');
      }
      if (perms.has(PermissionsBitField.Flags.BanMembers)) {
        keyPermissions.push('🔨 Ban Members');
      }
      if (perms.has(PermissionsBitField.Flags.ManageChannels)) {
        keyPermissions.push('📁 Manage Channels');
      }
      if (perms.has(PermissionsBitField.Flags.ManageRoles)) {
        keyPermissions.push('🏷️ Manage Roles');
      }

      const permissionsDisplay =
        keyPermissions.length > 0 ? keyPermissions.join(' • ') : 'Standard Member';

      const embed = new EmbedBuilder()
        .setColor(member.displayColor || 0x5865f2)
        .setTitle(`👤 ${member.displayName}`)
        .setThumbnail(member.displayAvatarURL({ size: 1024 }))
        .addFields([
          {
            name: '🏷️ User Identity',
            value: `${targetUser.tag}\n<@${targetUser.id}>`,
            inline: true,
          },
          {
            name: '🆔 User ID',
            value: `\`${targetUser.id}\``,
            inline: true,
          },
          {
            name: '🤖 Account Type',
            value: targetUser.bot ? 'Bot' : 'Human',
            inline: true,
          },
          {
            name: '📅 Account Created',
            value: `<t:${createdUnix}:F>\n(<t:${createdUnix}:R>)`,
            inline: true,
          },
          {
            name: '📥 Joined Server',
            value: joinedUnix ? `<t:${joinedUnix}:F>\n(<t:${joinedUnix}:R>)` : 'Unknown',
            inline: true,
          },
          {
            name: '🌍 Effective Timezone',
            value: `**${effectiveTz}**\n🕒 \`${formatLocalTime(effectiveTz, now)}\``,
            inline: true,
          },
        ]);

      // If user has economy balance / XP
      if (economyBal || xpProfile) {
        const credits = economyBal?.walletBalance ?? 0;
        const bank = economyBal?.bankBalance ?? 0;
        const level = xpProfile?.level ?? 1;
        const karma = xpProfile?.karma ?? 0;

        embed.addFields([
          {
            name: '💰 Economy & Progression',
            value: `Level: **${level}** • Karma: **${karma}** • Wallet: **${credits.toLocaleString()}** • Bank: **${bank.toLocaleString()}**`,
            inline: false,
          },
        ]);
      }

      embed.addFields([
        {
          name: `🏷️ Roles (${nonEveryoneRoles.length})`,
          value: rolesDisplay,
          inline: false,
        },
        {
          name: '🛡️ Key Permissions',
          value: permissionsDisplay,
          inline: false,
        },
      ]);

      embed.setFooter({ text: 'Ririko AI 2.0 • Identity & Utilities' });
      await ctx.reply({ embeds: [embed] });
    },
  };
}
