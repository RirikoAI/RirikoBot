import { CommandInterface } from '#command/command.interface';
import { Command } from '#command/command.class';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { DiscordPermissions } from '#util/features/permissions.util';

/**
 * AdminNoteCommand
 * @description Notes for a user readable only by admins.
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
export default class AdminNoteCommand
  extends Command
  implements CommandInterface
{
  name = 'admin-note';
  regex = new RegExp('^admin-note$|^admin-note ', 'i');
  description = 'Notes for a user readable only by admins.';
  category = 'moderation';
  usageExamples = ['admin-note @user <notes'];
  slashOptions = [
    {
      name: 'user',
      description: 'The user to note.',
      type: SlashCommandOptionTypes.User,
      required: true,
    },
    {
      name: 'notes',
      description: 'The notes for the user.',
      type: SlashCommandOptionTypes.String,
      required: true,
    },
  ];

  permissions: DiscordPermissions = ['ManageRoles'];

  async runPrefix(message: DiscordMessage) {}

  async runSlash(interaction: DiscordInteraction) {}
}
