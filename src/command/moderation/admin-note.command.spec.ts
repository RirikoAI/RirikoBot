import AdminNoteCommand from './admin-note.command';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';
import {
  MessageContextMenuCommandInteraction,
  UserContextMenuCommandInteraction,
} from 'discord.js';

jest.mock('#command/command.class');
jest.mock('#util/features/permissions.util');
jest.mock('discord.js');

describe('AdminNoteCommand', () => {
  let command: AdminNoteCommand;
  let message: DiscordMessage;
  // @ts-ignore
  let interaction: DiscordInteraction;

  beforeEach(() => {
    command = new AdminNoteCommand(jest.fn() as any);
    message = {
      mentions: {
        users: {
          first: jest.fn().mockReturnValue({ id: 'user-id' }),
        },
      },
      author: { id: 'admin-id' },
      guild: { id: 'guild-id' },
      reply: jest.fn(),
    } as unknown as DiscordMessage;

    interaction = {
      options: {
        getSubcommand: jest.fn(),
        getUser: jest.fn().mockReturnValue({ id: 'user-id' }),
        getString: jest.fn().mockReturnValue('notes'),
      },
      user: { id: 'admin-id' },
      guild: { id: 'guild-id' },
      reply: jest.fn(),
    } as unknown as DiscordInteraction;

    command.db = {
      userNoteRepository: {
        findOne: jest.fn() as any,
        save: jest.fn() as any,
        remove: jest.fn() as any,
      },
    } as any;
  });

  it('should add a note', async () => {
    command.params = ['add', '@user', 'notes'];
    (command as any).db.userNoteRepository.findOne.mockResolvedValue(null);
    await command.runPrefix(message);
    expect(command.db.userNoteRepository.save).toHaveBeenCalledWith({
      user: { id: 'user-id' },
      note: 'notes',
      createdBy: 'admin-id',
      guild: { id: 'guild-id' },
    });
  });

  it('should update a note', async () => {
    command.params = ['add', '@user', 'notes'];
    (command as any).db.userNoteRepository.findOne.mockResolvedValue({
      note: 'old note',
      createdBy: 'admin-id',
      updatedAt: new Date(),
    });

    (command as any).db.userNoteRepository.save.mockResolvedValue({
      note: 'old note',
      createdBy: 'admin-id',
      updatedAt: new Date(),
    });

    await command.runPrefix(message);
    expect(command.db.userNoteRepository.save).toHaveBeenCalled();
  });

  it('should remove a note', async () => {
    command.params = ['remove', '@user'];
    (command as any).db.userNoteRepository.findOne.mockResolvedValue({
      note: 'old note',
    });
    await command.runPrefix(message);
    expect(command.db.userNoteRepository.remove).toHaveBeenCalled();
  });

  it('should list notes', async () => {
    (command as any).db.userNoteRepository.findOne.mockResolvedValue({
      note: 'notes',
      createdBy: 'admin-id',
      updatedAt: new Date(),
    });
    await command.runPrefix(message);
    expect(message.reply).toHaveBeenCalled();
  });

  it('should handle invalid subcommand', async () => {
    command.params = ['invalid'];
    await command.runPrefix(message);
    expect(message.reply).toHaveBeenCalledWith(
      'Invalid subcommand. Available subcommands: add, remove, list. View help entry for more information.',
    );
  });

  it('should handle invalid parameters', async () => {
    command.params = [];
    await command.runPrefix(message);
    expect(message.reply).toHaveBeenCalledWith(
      'Invalid subcommand. Available subcommands: add, remove, list. View help entry for more information.',
    );
  });

  describe('runSlash', () => {
    it('should add a note', async () => {
      interaction.options.getSubcommand.mockReturnValue('add');
      (command as any).db.userNoteRepository.findOne.mockResolvedValue(null);
      await command.runSlash(interaction);
      expect(command.db.userNoteRepository.save).toHaveBeenCalledWith({
        user: { id: 'user-id' },
        note: 'notes',
        createdBy: 'admin-id',
        guild: { id: 'guild-id' },
      });
    });

    it('should remove a note', async () => {
      interaction.options.getSubcommand.mockReturnValue('remove');
      (command as any).db.userNoteRepository.findOne.mockResolvedValue({
        note: 'old note',
      });
      await command.runSlash(interaction);
      expect(command.db.userNoteRepository.remove).toHaveBeenCalled();
    });

    it('should list notes', async () => {
      interaction.options.getSubcommand.mockReturnValue('list');
      (command as any).db.userNoteRepository.findOne.mockResolvedValue({
        note: 'notes',
        createdBy: 'admin-id',
        updatedAt: new Date(),
      });
      await command.runSlash(interaction);
      expect(interaction.reply).toHaveBeenCalled();
    });
  });

  describe('runChatMenu', () => {
    it('should list notes', async () => {
      const chatInteraction = {
        targetMessage: {
          member: { id: 'user-id' },
        },
        guild: { id: 'guild-id' },
        reply: jest.fn(),
      } as unknown as MessageContextMenuCommandInteraction;

      (command as any).db.userNoteRepository.findOne.mockResolvedValue({
        note: 'notes',
        createdBy: 'admin-id',
        updatedAt: new Date(),
      });

      await command.runChatMenu(chatInteraction);
      expect(chatInteraction.reply).toHaveBeenCalled();
    });
  });

  describe('runUserMenu', () => {
    it('should list notes', async () => {
      const userInteraction = {
        targetUser: { id: 'user-id' },
        reply: jest.fn(),
        guild: { id: 'guild-id' },
      } as unknown as UserContextMenuCommandInteraction;

      (command as any).db.userNoteRepository.findOne.mockResolvedValue({
        note: 'notes',
        createdBy: 'admin-id',
        updatedAt: new Date(),
      });

      await command.runUserMenu(userInteraction);
      expect(userInteraction.reply).toHaveBeenCalled();
    });
  });
});
