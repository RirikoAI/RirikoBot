import { CommandInterface } from '#command/command.interface';
import { Command } from '#command/command.class';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { DiscordPermissions } from '#util/features/permissions.util';
import {
  EmbedBuilder,
  MessageContextMenuCommandInteraction,
  UserContextMenuCommandInteraction,
} from 'discord.js';

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
  regex = new RegExp('^admin-note$|^admin-note |^note$|^note ', 'i');
  description = 'Notes for a user readable only by admins.';
  category = 'moderation';
  usageExamples = [
    'admin-note add @user <notes>',
    'admin-note remove @user',
    'admin-note list @user',
    'note add @user <notes>',
    'note remove @user',
    'note list @user',
  ];

  permissions: DiscordPermissions = ['ManageRoles'];

  slashOptions = [
    {
      name: 'add',
      type: SlashCommandOptionTypes.Subcommand,
      description: 'Add a note for a user.',
      options: [
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
      ],
    },
    {
      name: 'remove',
      type: SlashCommandOptionTypes.Subcommand,
      description: 'Remove a note for a user.',
      options: [
        {
          name: 'user',
          description: 'The user to remove note.',
          type: SlashCommandOptionTypes.User,
          required: true,
        },
      ],
    },
    {
      name: 'list',
      type: SlashCommandOptionTypes.Subcommand,
      description: 'List notes for a user.',
      options: [
        {
          name: 'user',
          description: 'The user to list notes.',
          type: SlashCommandOptionTypes.User,
          required: true,
        },
      ],
    },
  ];

  userMenuOption = {
    name: 'View admin notes',
  };

  chatMenuOption = {
    name: 'View admin notes',
  };

  async runPrefix(message: DiscordMessage) {
    try {
      const subCommand = this.params[0];
      switch (subCommand) {
        case 'add':
          return this.addNote(message, {
            userId: message.mentions.users.first().id,
            notes: this.params.slice(2).join(' '),
            adminId: message.author.id,
            guildId: message.guild.id,
          });
        case 'remove':
          return this.removeNote(message, {
            userId: message.mentions.users.first().id,
          });
        case 'list':
          return this.listNotes(message, {
            userId: message.mentions.users.first().id,
          });
        default:
          return message.reply(
            'Invalid subcommand. Available subcommands: add, remove, list. View help entry for more information.',
          );
      }
    } catch (e) {
      return message.reply(
        'Invalid parameters. View help entry for more information.',
      );
    }
  }

  async runSlash(interaction: DiscordInteraction) {
    const subCommand = interaction.options.getSubcommand();
    switch (subCommand) {
      case 'add':
        return this.addNote(interaction, {
          userId: interaction.options.getUser('user').id,
          notes: interaction.options.getString('notes'),
          adminId: interaction.user.id,
          guildId: interaction.guild.id,
        });
      case 'remove':
        return this.removeNote(interaction, {
          userId: interaction.options.getUser('user').id,
        });
      case 'list':
        return this.listNotes(interaction, {
          userId: interaction.options.getUser('user').id,
        });
    }
  }

  async runChatMenu(interaction: any) {
    return this.listNotes(interaction, {
      userId: (interaction as MessageContextMenuCommandInteraction)
        .targetMessage.member.id,
    });
  }

  async runUserMenu(interaction: any) {
    return this.listNotes(interaction, {
      userId: (interaction as UserContextMenuCommandInteraction).targetUser.id,
    });
  }

  async addNote(
    interaction: DiscordInteraction | DiscordMessage,
    params: {
      userId: string;
      notes: string;
      adminId: string;
      guildId: string;
    },
  ) {
    if (!params.userId) {
      const embed = new EmbedBuilder({
        title: 'Invalid user',
        description: 'Please mention a valid user.',
      });

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    let note = await this.db.userNoteRepository.findOne({
      where: {
        user: {
          id: params.userId,
        },
        guild: {
          id: params.guildId,
        },
      },
    });
    if (note) {
      note.note = params.notes;
      note.createdBy = params.adminId;
      note = await this.db.userNoteRepository.save(note);
      const embed = new EmbedBuilder({
        title: 'Note updated',
        description: `Note for user <@${params.userId}> has been updated.`,
        fields: [
          {
            name: 'Notes',
            value: params.notes,
          },
          {
            name: 'Last Updated by',
            value: `<@${params.adminId}>`,
          },
          {
            name: 'Last Updated at',
            value: `<t:${note.updatedAt.getTime() / 1000}:R>`,
          },
        ],
      });

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } else {
      await this.db.userNoteRepository.save({
        user: {
          id: params.userId,
        },
        note: params.notes,
        createdBy: params.adminId,
        guild: {
          id: params.guildId,
        },
      });
    }
  }

  async removeNote(
    interaction: DiscordInteraction | DiscordMessage,
    params: { userId: string },
  ) {
    const note = await this.db.userNoteRepository.findOne({
      where: {
        user: {
          id: params.userId,
        },
        guild: {
          id: interaction.guild.id,
        },
      },
    });
    if (note) {
      await this.db.userNoteRepository.remove(note);
      const embed = new EmbedBuilder({
        title: 'Note removed',
        description: `Note for user <@${params.userId}> has been removed.`,
      });

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } else {
      const embed = new EmbedBuilder({
        title: 'Note not found',
        description: `Note for user <@${params.userId}> not found.`,
      });

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }
  }

  async listNotes(
    interaction: DiscordInteraction | DiscordMessage,
    params: { userId: string },
  ) {
    if (!params.userId) {
      const embed = new EmbedBuilder({
        title: 'Invalid user',
        description: 'Please mention a valid user.',
      });

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    const note = await this.db.userNoteRepository.findOne({
      where: {
        user: {
          id: params.userId,
        },
        guild: {
          id: interaction.guild.id,
        },
      },
    });
    if (note) {
      const embed = new EmbedBuilder({
        title: 'Notes',
        description: `Notes for user <@${params.userId}>`,
        fields: [
          {
            name: 'Notes',
            value: note.note,
          },
          {
            name: 'Last Updated by',
            value: `<@${note.createdBy}>`,
          },
          {
            name: 'Last Updated at',
            value: `<t:${note.updatedAt.getTime() / 1000}:R>`,
          },
        ],
      });

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } else {
      const embed = new EmbedBuilder({
        title: 'Note not found',
        description: `Note for user <@${params.userId}> not found.`,
      });

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }
  }
}
