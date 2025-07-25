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
 * ReactionRolesCommand
 * @author Earnest Angel (angel.net.my)
 * @description List all reaction roles in the guild and optionally remove one
 * @category Command
 */
@Injectable()
export default class ReactionRolesCommand
  extends Command
  implements CommandInterface
{
  name = 'reaction-roles';
  regex = new RegExp('^reaction-roles |^reaction-roles$', 'i');
  description =
    'List all reaction roles in the guild and optionally remove one';
  category = 'guild';
  usageExamples = ['reaction-roles', 'reaction-roles remove <id>'];
  permissions = [PermissionFlagsBits.Administrator];

  slashOptions = [
    {
      name: 'list',
      description: 'List all reaction roles',
      type: SlashCommandOptionTypes.Subcommand,
    },
    {
      name: 'remove',
      description: 'Remove a reaction role',
      type: SlashCommandOptionTypes.Subcommand,
      options: [
        {
          name: 'id',
          description: 'The ID of the reaction role to remove',
          type: SlashCommandOptionTypes.String,
          required: true,
        },
      ],
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

    // Check if the user wants to remove a reaction role
    if (args.length >= 2 && args[0].toLowerCase() === 'remove') {
      const id = args[1];
      await this.handleRemoveReactionRole(message, id);
      return;
    }

    // Otherwise, list all reaction roles
    await this.handleListReactionRoles(message);
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

    // Get the subcommand
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'remove') {
      const id = interaction.options.getString('id');
      await this.handleRemoveReactionRole(interaction, id);
      return;
    }

    // Otherwise, list all reaction roles (subcommand === 'list')
    await this.handleListReactionRoles(interaction);
  }

  private async handleListReactionRoles(
    context: DiscordMessage | DiscordInteraction,
  ): Promise<void> {
    const guild = context.guild;
    const isInteraction =
      'reply' in context && typeof context.reply === 'function';

    try {
      // Get all reaction roles for this guild
      const reactionRoles =
        await this.services.reactionRoleService.getReactionRoles(guild.id);

      if (reactionRoles.length === 0) {
        const response = {
          content: 'No reaction roles have been set up in this server.',
          ephemeral: isInteraction,
        };

        if (isInteraction) {
          await (context as DiscordInteraction).reply(response);
        } else {
          await (context as DiscordMessage).reply(response);
        }
        return;
      }

      // Create an embed to display the reaction roles
      const embed = new EmbedBuilder()
        .setTitle('Reaction Roles')
        .setDescription(
          'Here are all the reaction roles set up in this server:',
        )
        .setColor('#00FF00')
        .setTimestamp();

      // Add each reaction role to the embed
      for (const reactionRole of reactionRoles) {
        const role = guild.roles.cache.get(reactionRole.roleId);
        const roleName = role ? role.name : 'Unknown Role';

        embed.addFields({
          name: `ID: ${reactionRole.id}`,
          value: `Message ID: ${reactionRole.messageId}\nEmoji: ${reactionRole.emoji}\nRole: ${roleName}`,
        });
      }

      // Add a footer with instructions on how to remove a reaction role
      embed.setFooter({
        text: 'To remove a reaction role, use: reaction-roles remove <id>',
      });

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

  private async handleRemoveReactionRole(
    context: DiscordMessage | DiscordInteraction,
    id: string,
  ): Promise<void> {
    const isInteraction =
      'reply' in context && typeof context.reply === 'function';

    try {
      // Delete the reaction role
      await this.services.reactionRoleService.deleteReactionRole(id);

      const response = {
        content: `Successfully removed reaction role with ID: ${id}`,
        ephemeral: isInteraction,
      };

      if (isInteraction) {
        await (context as DiscordInteraction).reply(response);
      } else {
        await (context as DiscordMessage).reply(response);
      }
    } catch (error) {
      const response = {
        content: `Error removing reaction role: ${error.message}`,
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
