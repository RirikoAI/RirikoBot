import {
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
} from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import type { ReactionRoleMode, ReactionRoleType } from '@ririko/services';

function hasAdminPermission(ctx: CommandContext): boolean {
  if (!ctx.member) return true;
  const perms = ctx.member.permissions;
  return (
    perms.has(PermissionFlagsBits.Administrator) ||
    perms.has(PermissionFlagsBits.ManageRoles) ||
    perms.has(PermissionFlagsBits.ManageGuild)
  );
}

function resolveRole(ctx: CommandContext, optionName: string, argIndex: number) {
  if (!ctx.guild) return null;
  if (ctx.source === 'slash' && 'options' in ctx.raw) {
    const role = (ctx.raw as any).options?.getRole?.(optionName);
    if (role) return role;
  }
  const rawArgs = ctx.options.getRawArgs();
  const rawVal = ctx.options.getString(optionName) || rawArgs[argIndex];
  if (!rawVal) return null;
  const cleanId = rawVal.replace(/[<@&>]/g, '').trim();
  return (
    ctx.guild.roles.cache.get(cleanId) ||
    ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === rawVal.toLowerCase()) ||
    null
  );
}

export function createCreateReactionRoleCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'create-reaction-role',
      category: CommandCategory.UTILITY,
      description: 'Create a reaction role system for a message (supports Emojis and Buttons)',
      aliases: ['createreactionrole', 'crr'],
      usage: '/create-reaction-role <message-id> <emoji> <role> [mode] [type] [group]',
      examples: [
        '/create-reaction-role message-id:123456789 emoji:🎮 role:@Gamers',
        '/create-reaction-role message-id:123456789 emoji:🔴 role:@Red mode:unique type:button group:colors',
        '!create-reaction-role 123456789 🎮 @Gamers',
      ],
      options: [
        {
          name: 'message-id',
          description: 'The ID of the message to add the reaction role to',
          type: 'STRING',
          required: true,
        },
        {
          name: 'emoji',
          description: 'The emoji or button label to use',
          type: 'STRING',
          required: true,
        },
        {
          name: 'role',
          description: 'The role to assign when clicked/reacted',
          type: 'ROLE',
          required: true,
        },
        {
          name: 'mode',
          description: 'Behavior mode (toggle, give_only, remove_only, unique)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Toggle (Add or Remove)', value: 'toggle' },
            { name: 'Give Only (Add once, never remove)', value: 'give_only' },
            { name: 'Remove Only (Remove only)', value: 'remove_only' },
            { name: 'Unique (Radio group - pick one)', value: 'unique' },
          ],
        },
        {
          name: 'type',
          description: 'Component type (emoji reaction or Discord button)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Emoji (Message Reaction)', value: 'emoji' },
            { name: 'Button (Discord Button Component)', value: 'button' },
          ],
        },
        {
          name: 'group',
          description: 'Optional group name for unique radio selections',
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
      const rawMessageId = ctx.options.getString('message-id') || rawArgs[0];
      const messageId = rawMessageId?.includes('/')
        ? rawMessageId.split('/').filter(Boolean).pop()!
        : rawMessageId;
      const emoji = ctx.options.getString('emoji') || rawArgs[1];
      const role = resolveRole(ctx, 'role', 2);

      if (!messageId || !emoji || !role) {
        await ctx.reply({
          content:
            '❌ Please provide a message ID, emoji/label, and role.\nUsage: `/create-reaction-role <message-id> <emoji> <role>`',
        });
        return;
      }

      // Validate bot permissions and role hierarchy
      if (!services.reactionRoleService.hasPermission(ctx.guild)) {
        await ctx.reply({
          content:
            "❌ I don't have permission to manage roles in this server. Please grant me the **Manage Roles** permission.",
        });
        return;
      }

      if (!services.reactionRoleService.isValidRole(ctx.guild, role.id)) {
        await ctx.reply({
          content:
            '❌ Invalid role. Make sure the role is not `@everyone`, is not managed by an integration, and is positioned **below** my highest role.',
        });
        return;
      }

      // Resolve options
      const rawMode = (ctx.options.getString('mode') || rawArgs[3] || 'toggle').toUpperCase();
      const mode: ReactionRoleMode = ['TOGGLE', 'GIVE_ONLY', 'REMOVE_ONLY', 'UNIQUE'].includes(
        rawMode,
      )
        ? (rawMode as ReactionRoleMode)
        : 'TOGGLE';

      const rawType = (ctx.options.getString('type') || rawArgs[4] || 'emoji').toUpperCase();
      const type: ReactionRoleType = rawType === 'BUTTON' ? 'BUTTON' : 'EMOJI';
      const group = ctx.options.getString('group') || rawArgs[5] || null;

      // Locate target message in channel or across channels
      let targetMessage: any = null;
      try {
        const channel = ctx.channel as TextChannel;
        if (channel && 'messages' in channel) {
          targetMessage = await channel.messages.fetch(messageId).catch(() => null);
        }

        if (!targetMessage) {
          // Search across cached text channels
          for (const ch of ctx.guild.channels.cache.values()) {
            if (ch.isTextBased() && 'messages' in ch) {
              targetMessage = await ch.messages.fetch(messageId).catch(() => null);
              if (targetMessage) break;
            }
          }
        }
      } catch {
        targetMessage = null;
      }

      if (!targetMessage) {
        await ctx.reply({
          content: `❌ Could not find message with ID \`${messageId}\`. Ensure the ID is correct and I have access to view the channel.`,
        });
        return;
      }

      try {
        // 1. Create DB record first to get ID
        const record = await services.reactionRoleRepo.create({
          guildId: ctx.guildId,
          channelId: targetMessage.channelId,
          messageId: targetMessage.id,
          emojiOrComponentId: emoji,
          roleId: role.id,
          type,
          mode,
          groupId: group,
          label: emoji,
        });

        // 2. Attach component or reaction to Discord message
        if (type === 'BUTTON') {
          const button = new ButtonBuilder()
            .setCustomId(`rr:btn:${record.id}`)
            .setLabel(`${emoji} ${role.name}`)
            .setStyle(ButtonStyle.Primary);

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

          const existingComponents = [...(targetMessage.components || [])];
          if (existingComponents.length < 5) {
            await targetMessage.edit({
              components: [...existingComponents, row],
            });
          } else {
            await targetMessage.edit({
              components: [row],
            });
          }
        } else {
          // Emoji reaction
          try {
            await targetMessage.react(emoji);
          } catch (reactErr: any) {
            await services.reactionRoleRepo.delete(record.id).catch(() => null);
            throw new Error(
              `Bot could not react with emoji "${emoji}": ${reactErr?.message || 'Invalid emoji or missing Add Reactions permission'}`,
              { cause: reactErr },
            );
          }
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ Reaction Role Created')
          .setDescription(`Successfully bound **${emoji}** to role **${role.name}**!`)
          .setColor('#00FF00')
          .addFields(
            {
              name: 'Target Message',
              value: `[\`Jump to Message\`](${targetMessage.url})`,
              inline: true,
            },
            { name: 'Role', value: `<@&${role.id}>`, inline: true },
            { name: 'Type', value: `\`${type}\``, inline: true },
            { name: 'Mode', value: `\`${mode}\``, inline: true },
            ...(group ? [{ name: 'Group', value: `\`${group}\``, inline: true }] : []),
          )
          .setFooter({ text: `ID: ${record.id}` })
          .setTimestamp();

        await ctx.reply({ embeds: [embed] });
      } catch (err: any) {
        console.error('[CreateReactionRoleCommand] Error creating reaction role:', err);
        await ctx.reply({
          content: `❌ Failed to create reaction role: ${err?.message || 'Unknown error'}`,
        });
      }
    },
  };
}
