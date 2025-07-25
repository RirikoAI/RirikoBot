import { Test, TestingModule } from '@nestjs/testing';
import ReminderCommand from './reminder.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';
import { ReminderService } from '#reminder/reminder.service';
import { Reminder } from '#database/entities/reminder.entity';

describe('ReminderCommand', () => {
  let command: ReminderCommand;
  let mockGuild: Guild;
  let mockUser: User;
  let mockReminderService: jest.Mocked<ReminderService>;

  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn().mockReturnValue('http://avatar.url'),
      },
    },
  };

  const mockCommandService = {
    getGuildPrefix: jest.fn(),
  };

  beforeEach(async () => {
    // Create mock for ReminderService
    mockReminderService = {
      createReminder: jest.fn(),
      getUserReminders: jest.fn(),
      deleteReminder: jest.fn(),
    } as unknown as jest.Mocked<ReminderService>;

    const mockSharedServices: SharedServicesMock = {
      ...TestSharedService,
      discord: mockDiscordService as unknown as DiscordService,
      commandService: mockCommandService as unknown as CommandService,
      reminderService: mockReminderService,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ReminderCommand,
          useValue: new ReminderCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<ReminderCommand>(ReminderCommand);

    mockUser = {
      id: '1234567890',
      username: 'TestUser',
      displayAvatarURL: jest.fn().mockReturnValue('http://avatar.url'),
    } as unknown as User;

    mockGuild = {
      id: '1234567890',
      name: 'Test Guild',
    } as unknown as Guild;

    // Spy on the parseTime method to test it independently
    jest.spyOn(command as any, 'parseTime');
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('parseTime', () => {
    it('should parse relative time correctly', () => {
      const now = new Date();
      const nowTime = now.getTime();

      // Mock Date constructor and Date.now
      jest.spyOn(global, 'Date').mockImplementation(() => {
        return {
          getTime: () => nowTime,
          getMinutes: () => now.getMinutes(),
          getHours: () => now.getHours(),
          getDate: () => now.getDate(),
          setMinutes: (m) => {
            now.setMinutes(m);
          },
          setHours: (h) => {
            now.setHours(h);
          },
          setDate: (d) => {
            now.setDate(d);
          },
        } as any;
      });

      // Mock Date.now
      Date.now = jest.fn(() => nowTime);

      // Test minutes
      let result = (command as any).parseTime('30m');
      let expected = new Date(now);
      expected.setMinutes(expected.getMinutes() + 30);
      expect(result.getTime()).toEqual(expected.getTime());

      // Test hours
      result = (command as any).parseTime('2h');
      expected = new Date(now);
      expected.setHours(expected.getHours() + 2);
      expect(result.getTime()).toEqual(expected.getTime());

      // Test days
      result = (command as any).parseTime('3d');
      expected = new Date(now);
      expected.setDate(expected.getDate() + 3);
      expect(result.getTime()).toEqual(expected.getTime());
    });

    it('should return null for invalid time formats', () => {
      expect((command as any).parseTime('invalid')).toBeNull();
      expect((command as any).parseTime('30x')).toBeNull();
      expect((command as any).parseTime('2023-13-25 08:00')).toBeNull();
    });
  });

  describe('runPrefix', () => {
    it('should call listReminders when command is "remindme list"', async () => {
      const mockMessage = {
        content: 'remindme list',
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      // Spy on the listReminders method
      const listRemindersSpy = jest
        .spyOn(command as any, 'listReminders')
        .mockResolvedValue(undefined);

      await command.runPrefix(mockMessage);

      expect(listRemindersSpy).toHaveBeenCalledWith(mockMessage);
    });

    it('should call cancelReminder when command is "remindme cancel <id>"', async () => {
      const mockMessage = {
        content: 'remindme cancel abc123',
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      // Spy on the cancelReminder method
      const cancelReminderSpy = jest
        .spyOn(command as any, 'cancelReminder')
        .mockResolvedValue(undefined);

      await command.runPrefix(mockMessage);

      expect(cancelReminderSpy).toHaveBeenCalledWith(mockMessage, 'abc123');
    });

    it('should call setReminder when command is "remindme <time> <message>"', async () => {
      const mockMessage = {
        content: 'remindme 1h Take a break',
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      // Spy on the setReminder method
      const setReminderSpy = jest
        .spyOn(command as any, 'setReminder')
        .mockResolvedValue(undefined);

      await command.runPrefix(mockMessage);

      expect(setReminderSpy).toHaveBeenCalledWith(
        mockMessage,
        '1h',
        'Take a break',
      );
    });

    it('should reply with error message for invalid format', async () => {
      const mockMessage = {
        content: 'remindme',
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Invalid format'),
      });
    });
  });

  describe('runSlash', () => {
    it('should call listRemindersInteraction when subcommand is "list"', async () => {
      const mockInteraction = {
        options: {
          getSubcommand: jest.fn().mockReturnValue('list'),
        },
        guild: mockGuild,
        user: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      // Spy on the listRemindersInteraction method
      const listRemindersSpy = jest
        .spyOn(command as any, 'listRemindersInteraction')
        .mockResolvedValue(undefined);

      await command.runSlash(mockInteraction);

      expect(listRemindersSpy).toHaveBeenCalledWith(mockInteraction);
    });

    it('should call cancelReminderInteraction when subcommand is "cancel"', async () => {
      const mockInteraction = {
        options: {
          getSubcommand: jest.fn().mockReturnValue('cancel'),
          getString: jest.fn().mockReturnValue('abc123'),
        },
        guild: mockGuild,
        user: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      // Spy on the cancelReminderInteraction method
      const cancelReminderSpy = jest
        .spyOn(command as any, 'cancelReminderInteraction')
        .mockResolvedValue(undefined);

      await command.runSlash(mockInteraction);

      expect(cancelReminderSpy).toHaveBeenCalledWith(mockInteraction, 'abc123');
    });

    it('should call setReminderInteraction when subcommand is "set"', async () => {
      const mockInteraction = {
        options: {
          getSubcommand: jest.fn().mockReturnValue('set'),
          getString: jest.fn().mockImplementation((name) => {
            if (name === 'time') return '1h';
            if (name === 'message') return 'Take a break';
            return null;
          }),
        },
        guild: mockGuild,
        user: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      // Spy on the setReminderInteraction method
      const setReminderSpy = jest
        .spyOn(command as any, 'setReminderInteraction')
        .mockResolvedValue(undefined);

      await command.runSlash(mockInteraction);

      expect(setReminderSpy).toHaveBeenCalledWith(
        mockInteraction,
        '1h',
        'Take a break',
      );
    });
  });

  describe('setReminder', () => {
    it('should create a reminder and reply with success message', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        channel: { id: 'channel123' },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const timeString = '1h';
      const reminderMessage = 'Take a break';
      const scheduledTime = new Date();
      scheduledTime.setHours(scheduledTime.getHours() + 1);

      // Mock parseTime to return a valid date
      jest.spyOn(command as any, 'parseTime').mockReturnValue(scheduledTime);

      // Mock createReminder to return a reminder
      const mockReminder = {
        id: 'reminder123',
        userId: mockUser.id,
        channelId: 'channel123',
        guildId: mockGuild.id,
        message: reminderMessage,
        scheduledTime,
        sent: false,
      } as Reminder;

      mockReminderService.createReminder.mockResolvedValue(mockReminder);

      await (command as any).setReminder(
        mockMessage,
        timeString,
        reminderMessage,
      );

      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it('should reply with error for invalid time format', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      // Mock parseTime to return null (invalid time)
      jest.spyOn(command as any, 'parseTime').mockReturnValue(null);

      await (command as any).setReminder(
        mockMessage,
        'invalid',
        'Take a break',
      );

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Invalid time format'),
      });
    });

    it('should reply with error for time in the past', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      // Mock parseTime to return a past date
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);
      jest.spyOn(command as any, 'parseTime').mockReturnValue(pastDate);

      await (command as any).setReminder(mockMessage, '1h', 'Take a break');

      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        channel: { id: 'channel123' },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      // Mock parseTime to return a valid date
      const scheduledTime = new Date();
      scheduledTime.setHours(scheduledTime.getHours() + 1);
      jest.spyOn(command as any, 'parseTime').mockReturnValue(scheduledTime);

      // Mock createReminder to throw an error
      mockReminderService.createReminder.mockRejectedValue(
        new Error('Database error'),
      );

      await (command as any).setReminder(mockMessage, '1h', 'Take a break');

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('An error occurred'),
      });
    });
  });

  describe('listReminders', () => {
    it('should display reminders when user has active reminders', async () => {
      const mockMessage = {
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      // Mock getUserReminders to return reminders
      const mockReminders = [
        {
          id: 'reminder123',
          message: 'Take a break',
          scheduledTime: new Date(),
        },
      ] as Reminder[];

      mockReminderService.getUserReminders.mockResolvedValue(mockReminders);

      await (command as any).listReminders(mockMessage);

      expect(mockReminderService.getUserReminders).toHaveBeenCalledWith(
        mockUser.id,
      );
      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it('should display message when user has no active reminders', async () => {
      const mockMessage = {
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      // Mock getUserReminders to return empty array
      mockReminderService.getUserReminders.mockResolvedValue([]);

      await (command as any).listReminders(mockMessage);

      expect(mockReminderService.getUserReminders).toHaveBeenCalledWith(
        mockUser.id,
      );
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('no active reminders'),
      });
    });

    it('should handle errors gracefully', async () => {
      const mockMessage = {
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      // Mock getUserReminders to throw an error
      mockReminderService.getUserReminders.mockRejectedValue(
        new Error('Database error'),
      );

      await (command as any).listReminders(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('An error occurred'),
      });
    });
  });

  describe('cancelReminder', () => {
    it('should cancel reminder and reply with success message', async () => {
      const mockMessage = {
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const reminderId = 'reminder123';

      // Mock deleteReminder to return true (success)
      mockReminderService.deleteReminder.mockResolvedValue(true);

      await (command as any).cancelReminder(mockMessage, reminderId);

      expect(mockReminderService.deleteReminder).toHaveBeenCalledWith(
        reminderId,
        mockUser.id,
      );
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('cancelled successfully'),
      });
    });

    it('should reply with error message when reminder not found', async () => {
      const mockMessage = {
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const reminderId = 'reminder123';

      // Mock deleteReminder to return false (not found)
      mockReminderService.deleteReminder.mockResolvedValue(false);

      await (command as any).cancelReminder(mockMessage, reminderId);

      expect(mockReminderService.deleteReminder).toHaveBeenCalledWith(
        reminderId,
        mockUser.id,
      );
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Reminder not found'),
      });
    });

    it('should handle errors gracefully', async () => {
      const mockMessage = {
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const reminderId = 'reminder123';

      // Mock deleteReminder to throw an error
      mockReminderService.deleteReminder.mockRejectedValue(
        new Error('Database error'),
      );

      await (command as any).cancelReminder(mockMessage, reminderId);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('An error occurred'),
      });
    });
  });
});
