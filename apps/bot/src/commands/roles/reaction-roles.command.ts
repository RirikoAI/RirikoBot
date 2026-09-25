import { EmbedBuilder, PermissionFlagsBits, type TextChannel } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';

function hasAdminPermission(ctx: CommandContext): boolean {
  if (!ctx.member) return true;
  const perms = ctx.member.permissions;
  return (
    perms.has(PermissionFlagsBits.Administrator) ||
    perms.has(PermissionFlagsBits.ManageRoles) ||
    perms.has(PermissionFlagsBits.ManageGuild)
  );
}

export function createReactionRolesCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'reaction-roles',
      category: CommandCategory.UTILITY,
      description: 'List all reaction roles in the guild and optionally remove one',
      aliases: ['reactionroles', 'rr'],
      usage: '/reaction-roles [action] [id]',
      examples: [
        '/reaction-roles',
        '/reaction-roles action:remove id:12345678-abcd',
        '!reaction-roles',
        '!reaction-roles remove 12345678-abcd',
      ],
      options: [
        {
          name: 'action',
          description: 'Action to perform (list or remove)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'List (Show all reaction roles)', value: 'list' },
            { name: 'Remove (Delete a reaction role configuration)', value: 'remove' },
          ],
        },
        {
          name: 'id',
          description: 'The ID of the reaction role to remove',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId || !ctx.guild) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      if (!hasAdminPermission(ctx)) {
        await ctx.reply({
          content: '❌ You need Administrator or Manage Roles permission to use this command.',
        });
        return;
      }

      const rawArgs = ctx.options.getRawArgs();
      let action = ctx.options.getString('action')?.toLowerCase();
      if (!action) {
        const first = rawArgs[0]?.toLowerCase();
        if (first === 'remove' || first === 'list') {
          action = first;
        } else {
          action = 'list';
        }
      }

      if (action === 'remove') {
        const id = ctx.options.getString('id') || rawArgs[1];
        if (!id) {
          await ctx.reply({
            content:
              '❌ Please specify the ID of the reaction role to remove.\nUsage: `/reaction-roles action:remove id:<id>` or `!reaction-roles remove <id>`',
          });
          return;
        }

        const existing = await services.reactionRoleRepo.findById(id);
        if (!existing || existing.guildId !== ctx.guildId) {
          await ctx.reply({
            content: `❌ Could not find reaction role with ID \`${id}\` in this server.`,
          });
          return;
        }

        try {
          // Attempt best-effort cleanup of emoji reaction if applicable
          if (existing.type === 'EMOJI' && existing.channelId) {
            try {
              const channel = (await ctx.guild.channels
                .fetch(existing.channelId)
                .catch(() => null)) as TextChannel | null;
              if (channel && 'messages' in channel) {
                const msg = await channel.messages.fetch(existing.messageId).catch(() => null);
                if (msg) {
                  const reaction = msg.reactions.cache.get(existing.emojiOrComponentId);
                  if (reaction) {
                    await reaction.users.remove(ctx.guild.members.me?.id ?? '').catch(() => {});
                  }
                }
              }
            } catch {
              // Non-fatal if message/channel no longer exists
            }
          }

          await services.reactionRoleRepo.delete(id);
          await ctx.reply({
            content: `✅ Successfully removed reaction role with ID: \`${id}\`.`,
          });
        } catch (err: any) {
          await ctx.reply({
            content: `❌ Failed to remove reaction role: ${err?.message || 'Unknown error'}`,
          });
        }
        return;
      }

      // Default: List
      try {
        const list = await services.reactionRoleRepo.findByGuildId(ctx.guildId);
        if (list.length === 0) {
          await ctx.reply({
            content: 'ℹ️ No reaction roles have been set up in this server.',
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('🎭 Reaction Roles')
          .setDescription(`Here are all the reaction roles configured in **${ctx.guild.name}**:`)
          .setColor('#5865F2')
          .setTimestamp();

        // Limit to 25 fields per embed
        const displayList = list.slice(0, 25);
        for (const rr of displayList) {
          const role = ctx.guild.roles.cache.get(rr.roleId);
          const roleText = role ? `<@&${role.id}> (${role.name})` : `\`${rr.roleId}\` (Unknown)`;
          const groupText = rr.groupId ? `\n• Group: \`${rr.groupId}\`` : '';

          embed.addFields({
            name: `ID: \`${rr.id}\``,
            value: `• Message: \`${rr.messageId}\`\n• Trigger: **${rr.emojiOrComponentId}**\n• Role: ${roleText}\n• Type: \`${rr.type}\` | Mode: \`${rr.mode}\`${groupText}`,
            inline: false,
          });
        }

        if (list.length > 25) {
          embed.setFooter({
            text: `Showing 25 of ${list.length} reaction roles. To remove one: /reaction-roles action:remove id:<id>`,
          });
        } else {
          embed.setFooter({
            text: 'To remove a reaction role, use: /reaction-roles action:remove id:<id>',
          });
        }

        await ctx.reply({ embeds: [embed] });
      } catch (err: any) {
        await ctx.reply({
          content: `❌ Error listing reaction roles: ${err?.message || 'Unknown error'}`,
        });
      }
    },
  };
}
