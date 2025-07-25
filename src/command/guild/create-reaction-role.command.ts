import { Injectable } from '@nestjs/common';
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';

/**
 * CreateReactionRoleCommand
 * @author Earnest Angel (angel.net.my)
 * @description Create a reaction role system for a message
 * @category Command
 */
@Injectable()
export default class CreateReactionRoleCommand
  extends Command
  implements CommandInterface
{
  name = 'create-reaction-role';
  regex = new RegExp('^create-reaction-role |^create-reaction-role$', 'i');
  description = 'Create a reaction role system for a message';
  category = 'guild';
  usageExamples = ['create-reaction-role <message-id> <emoji> <role>'];
  permissions = [PermissionFlagsBits.Administrator];

  slashOptions = [
    {
      name: 'message-id',
      description: 'The ID of the message to add the reaction role to',
      type: SlashCommandOptionTypes.String,
      required: true,
    },
    {
      name: 'emoji',
      description: 'The emoji to use for the reaction role',
      type: SlashCommandOptionTypes.String,
      required: true,
    },
    {
      name: 'role',
      description: 'The role to assign when the reaction is triggered',
      type: SlashCommandOptionTypes.Role,
      required: true,
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<void> {
    // Check if the user has permission to use this command
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply({
        content: 'You need Administrator permission to use this command.',
      });
      return;
    }

    // Parse the command arguments
    const args = message.content.split(' ').slice(1);
    if (args.length < 3) {
      await message.reply({
        content: 'Please provide a message ID, emoji, and role.',
      });
      return;
    }

    const messageId = args[0];
    const emoji = args[1];
    const roleId = args[2].replace(/[<@&>]/g, ''); // Remove role mention formatting if present

    await this.handleReactionRole(message, messageId, emoji, roleId);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    // Check if the user has permission to use this command
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      await interaction.reply({
        content: 'You need Administrator permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    const messageId = interaction.options.getString('message-id');
    const emoji = interaction.options.getString('emoji');
    const role = interaction.options.getRole('role');

    await this.handleReactionRole(interaction, messageId, emoji, role.id);
  }

  private async handleReactionRole(
    context: DiscordMessage | DiscordInteraction,
    messageId: string,
    emoji: string,
    roleId: string,
  ): Promise<void> {
    const guild = context.guild;
    const isInteraction =
      'reply' in context && typeof context.reply === 'function';

    // Check if the bot has permission to manage roles
    if (!this.services.reactionRoleService.hasPermission(guild)) {
      const response = {
        content: "I don't have permission to manage roles in this server.",
        ephemeral: isInteraction,
      };

      if (isInteraction) {
        await (context as DiscordInteraction).reply(response);
      } else {
        await (context as DiscordMessage).reply(response);
      }
      return;
    }

    // Check if the role is valid
    if (!this.services.reactionRoleService.isValidRole(guild, roleId)) {
      const response = {
        content:
          'Invalid role. Make sure the role exists and is not the @everyone role. Also, my highest role must be above the role you want to assign.',
        ephemeral: isInteraction,
      };

      if (isInteraction) {
        await (context as DiscordInteraction).reply(response);
      } else {
        await (context as DiscordMessage).reply(response);
      }
      return;
    }

    try {
      // Try to fetch the message to verify it exists
      const channel = await guild.channels.fetch(context.channelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error('Channel not found or is not a text channel');
      }

      try {
        const targetMessage = await channel.messages.fetch(messageId);
        if (!targetMessage) {
          throw new Error('Message not found');
        }

        // Add the reaction to the message
        await targetMessage.react(emoji);

        // Save the reaction role to the database
        await this.services.reactionRoleService.createReactionRole(
          guild.id,
          messageId,
          emoji,
          roleId,
        );

        const role = guild.roles.cache.get(roleId);
        const embed = new EmbedBuilder()
          .setTitle('Reaction Role Created')
          .setDescription(
            `Users who react with ${emoji} to [this message](${targetMessage.url}) will receive the ${role.name} role.`,
          )
          .setColor('#00FF00')
          .setTimestamp();

        const response = {
          embeds: [embed],
          ephemeral: isInteraction,
        };

        if (isInteraction) {
          await (context as DiscordInteraction).reply(response);
        } else {
          await (context as DiscordMessage).reply(response);
        }
      } catch (error) {
        const response = {
          content: `Error: ${error.message}.`,
          ephemeral: isInteraction,
        };

        if (isInteraction) {
          await (context as DiscordInteraction).reply(response);
        } else {
          await (context as DiscordMessage).reply(response);
        }
      }
    } catch (error) {
      const response = {
        content: `An error occurred: ${error.message}`,
        ephemeral: isInteraction,
      };

      if (isInteraction) {
        await (context as DiscordInteraction).reply(response);
      } else {
        await (context as DiscordMessage).reply(response);
      }
    }
  }
}
