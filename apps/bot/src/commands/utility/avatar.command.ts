import { EmbedBuilder, type User, type GuildMember } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';

/**
 * Creates the dual-dispatch `/get-avatar` command with legacy `!avatar` and `!pfp` parity.
 */
export function createAvatarCommand(_services: BotServices): Command {
  return {
    metadata: {
      name: 'get-avatar',
      category: CommandCategory.UTILITY,
      description: 'Get the avatar of a user or yourself with high-resolution download links',
      aliases: ['avatar', 'pfp'],
      usage: '/get-avatar [user:<target>] [server_avatar:<true|false>] | !avatar [@user|id] | !pfp',
      examples: [
        '/get-avatar',
        '/get-avatar user:@Ririko',
        '/get-avatar server_avatar:true',
        '!avatar',
        '!avatar @Ririko',
        '!pfp',
      ],
      options: [
        {
          name: 'user',
          description: 'The user whose avatar you want to view (defaults to yourself)',
          type: 'USER',
          required: false,
        },
        {
          name: 'server_avatar',
          description: 'Display server-specific avatar if available (defaults to false)',
          type: 'BOOLEAN',
          required: false,
        },
      ],
    },

    async execute(ctx: CommandContext): Promise<void> {
      let targetUser: User = ctx.user;
      let wantsServerAvatar = false;

      if (ctx.source === 'slash') {
        const optionUser = await ctx.options.getUser('user');
        if (optionUser) {
          targetUser = optionUser;
        }
        wantsServerAvatar = ctx.options.getBoolean('server_avatar') ?? false;
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

      // Check if guild-specific avatar exists
      let member: GuildMember | null = null;
      if (ctx.guild) {
        member = await ctx.guild.members.fetch(targetUser.id).catch(() => null);
      }

      const hasServerAvatar = member?.avatar != null;
      const useServerAvatar = wantsServerAvatar && hasServerAvatar;

      const avatarUrl = useServerAvatar
        ? member!.displayAvatarURL({ size: 4096 })
        : targetUser.displayAvatarURL({ size: 4096 });

      const pngUrl = useServerAvatar
        ? member!.displayAvatarURL({ extension: 'png', size: 4096 })
        : targetUser.displayAvatarURL({ extension: 'png', size: 4096 });

      const jpgUrl = useServerAvatar
        ? member!.displayAvatarURL({ extension: 'jpeg', size: 4096 })
        : targetUser.displayAvatarURL({ extension: 'jpeg', size: 4096 });

      const webpUrl = useServerAvatar
        ? member!.displayAvatarURL({ extension: 'webp', size: 4096 })
        : targetUser.displayAvatarURL({ extension: 'webp', size: 4096 });

      const isAnimated = useServerAvatar
        ? member!.avatar?.startsWith('a_')
        : targetUser.avatar?.startsWith('a_');

      const gifUrl = isAnimated
        ? useServerAvatar
          ? member!.displayAvatarURL({ extension: 'gif', size: 4096 })
          : targetUser.displayAvatarURL({ extension: 'gif', size: 4096 })
        : null;

      const formatLinks = [`[PNG](${pngUrl})`, `[JPG](${jpgUrl})`, `[WebP](${webpUrl})`];
      if (gifUrl) {
        formatLinks.push(`[GIF](${gifUrl})`);
      }

      const titleName = useServerAvatar
        ? member?.displayName || targetUser.displayName || targetUser.username
        : targetUser.displayName || targetUser.username;
      const subtitle = useServerAvatar ? ' (Server Avatar)' : '';

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🖼️ Avatar of ${titleName}${subtitle}`)
        .setDescription(`**Download Formats:** ${formatLinks.join(' • ')}`)
        .setImage(avatarUrl)
        .setFooter({ text: `User ID: ${targetUser.id} • Ririko AI 2.0` });

      await ctx.reply({ embeds: [embed] });
    },
  };
}
