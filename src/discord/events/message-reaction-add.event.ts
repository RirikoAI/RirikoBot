import { Logger } from '@nestjs/common';
import {
  Events,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
} from 'discord.js';
import { DiscordClient } from '#discord/discord.client';
import { ReactionRoleService } from '#reaction-role/reaction-role.service';

/**
 * MessageReactionAddEvent
 * @description Event handler for the messageReactionAdd event
 * @author Earnest Angel (https://angel.net.my)
 */
export const MessageReactionAddEvent = (
  client: DiscordClient,
  reactionRoleService: ReactionRoleService,
) => {
  const logger = new Logger('MessageReactionAddEvent');

  client.on(
    Events.MessageReactionAdd,
    async (
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser,
    ) => {
      try {
        // Skip if the user is a bot
        if (user.bot) return;

        // Fetch the reaction and user if they're partial
        if (reaction.partial) {
          try {
            reaction = await reaction.fetch();
          } catch (error) {
            logger.error(`Error fetching partial reaction: ${error.message}`);
            return;
          }
        }

        if (user.partial) {
          try {
            user = await user.fetch();
          } catch (error) {
            logger.error(`Error fetching partial user: ${error.message}`);
            return;
          }
        }

        // Get the message ID and emoji
        const messageId = reaction.message.id;
        const emoji = reaction.emoji.id
          ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
          : reaction.emoji.name;

        // Check if there's a reaction role for this message and emoji
        const reactionRole = await reactionRoleService.getReactionRole(
          messageId,
          emoji,
        );
        if (!reactionRole) return;

        // Get the guild and member
        const guild = reaction.message.guild;
        if (!guild) return;

        // Check if the bot has permission to manage roles
        if (!reactionRoleService.hasPermission(guild)) {
          logger.warn(
            `Bot doesn't have permission to manage roles in guild ${guild.id}`,
          );
          return;
        }

        // Check if the role is valid
        if (!reactionRoleService.isValidRole(guild, reactionRole.roleId)) {
          logger.warn(
            `Invalid role ${reactionRole.roleId} in guild ${guild.id}`,
          );
          return;
        }

        // Get the member and role
        const member = await guild.members.fetch(user.id);
        const role = guild.roles.cache.get(reactionRole.roleId);

        // Assign the role
        const success = await reactionRoleService.assignRole(member, role);
        if (success) {
          logger.log(
            `Assigned role ${role.name} to ${user.tag} in guild ${guild.name}`,
          );
        } else {
          logger.error(
            `Failed to assign role ${role.name} to ${user.tag} in guild ${guild.name}`,
          );
        }
      } catch (error) {
        logger.error(`Error handling reaction add: ${error.message}`);
      }
    },
  );
};
