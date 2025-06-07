import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { Reminder } from '#database/entities/reminder.entity';
import { DiscordService } from '#discord/discord.service';

describe('ReminderService', () => {
  let service: ReminderService;
  let repository: jest.Mocked<Repository<Reminder>>;
  let discordService: any;
  let loggerSpy: jest.SpyInstance;

  const mockReminder: Reminder = {
    id: '1',
    userId: 'user123',
    channelId: 'channel123',
    guildId: 'guild123',
    message: 'Test reminder',
    scheduledTime: new Date(),
    timezone: 'UTC',
    sent: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Reminder;

  const mockDiscordUser = {
    send: jest.fn(),
  };

  const mockDiscordChannel = {
    isTextBased: jest.fn().mockReturnValue(true),
    send: jest.fn(),
  };

  beforeEach(async () => {
    const repositoryMock = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };

    const discordServiceMock = {
      client: {
        users: {
          fetch: jest.fn(),
        },
        channels: {
          fetch: jest.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderService,
        {
          provide: getRepositoryToken(Reminder),
          useValue: repositoryMock,
        },
        {
          provide: DiscordService,
          useValue: discordServiceMock,
        },
      ],
    }).compile();

    service = module.get<ReminderService>(ReminderService);
    repository = module.get(getRepositoryToken(Reminder));
    discordService = module.get(DiscordService);
    loggerSpy = jest.spyOn(Logger.prototype, 'error');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createReminder', () => {
    it('should create and save a reminder', async () => {
      repository.create.mockReturnValue(mockReminder);
      repository.save.mockResolvedValue(mockReminder);

      const result = await service.createReminder(
        'user123',
        'channel123',
        'guild123',
        'Test reminder',
        new Date(),
        'UTC',
      );

      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(mockReminder);
      expect(result).toEqual(mockReminder);
    });
  });

  describe('getPendingReminders', () => {
    it('should return pending reminders', async () => {
      repository.find.mockResolvedValue([mockReminder]);

      const result = await service.getPendingReminders();

      expect(repository.find).toHaveBeenCalledWith({
        where: {
          sent: false,
          scheduledTime: expect.any(Object),
        },
      });
      expect(result).toEqual([mockReminder]);
    });
  });

  describe('getUserReminders', () => {
    it('should return user reminders', async () => {
      repository.find.mockResolvedValue([mockReminder]);

      const result = await service.getUserReminders('user123');

      expect(repository.find).toHaveBeenCalledWith({
        where: {
          userId: 'user123',
          sent: false,
        },
        order: {
          scheduledTime: 'ASC',
        },
      });
      expect(result).toEqual([mockReminder]);
    });
  });

  describe('deleteReminder', () => {
    it('should delete reminder successfully', async () => {
      repository.delete.mockResolvedValue({ affected: 1 } as any);

      const result = await service.deleteReminder('1', 'user123');

      expect(repository.delete).toHaveBeenCalledWith({
        id: '1',
        userId: 'user123',
      });
      expect(result).toBe(true);
    });

    it('should return false when reminder not found', async () => {
      repository.delete.mockResolvedValue({ affected: 0 } as any);

      const result = await service.deleteReminder('1', 'user123');

      expect(result).toBe(false);
    });
  });

  describe('markReminderAsSent', () => {
    it('should mark reminder as sent successfully', async () => {
      repository.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.markReminderAsSent('1');

      expect(repository.update).toHaveBeenCalledWith(
        { id: '1' },
        { sent: true },
      );
      expect(result).toBe(true);
    });
  });

  describe('sendReminder', () => {
    it('should send reminder via DM successfully', async () => {
      discordService.client.users.fetch.mockResolvedValue(mockDiscordUser);
      mockDiscordUser.send.mockResolvedValue(true);
      repository.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.sendReminder(mockReminder);

      expect(discordService.client.users.fetch).toHaveBeenCalledWith(
        mockReminder.userId,
      );
      expect(mockDiscordUser.send).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should send reminder to channel when DM fails', async () => {
      discordService.client.users.fetch.mockResolvedValue(mockDiscordUser);
      mockDiscordUser.send.mockRejectedValue(new Error('DM failed'));
      discordService.client.channels.fetch.mockResolvedValue(
        mockDiscordChannel,
      );
      repository.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.sendReminder(mockReminder);

      expect(discordService.client.channels.fetch).toHaveBeenCalledWith(
        mockReminder.channelId,
      );
      expect(mockDiscordChannel.send).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should handle user not found', async () => {
      discordService.client.users.fetch.mockResolvedValue(null);

      const result = await service.sendReminder(mockReminder);

      expect(result).toBe(false);
    });

    it('should handle channel not found', async () => {
      discordService.client.users.fetch.mockResolvedValue(mockDiscordUser);
      mockDiscordUser.send.mockRejectedValue(new Error('DM failed'));
      discordService.client.channels.fetch.mockResolvedValue(null);

      const result = await service.sendReminder(mockReminder);

      expect(result).toBe(false);
    });

    it('should handle error when fetching user', async () => {
      discordService.client.users.fetch.mockRejectedValue(
        new Error('Fetch error'),
      );

      const result = await service.sendReminder(mockReminder);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Fetch error'),
      );
      expect(result).toBe(false);
    });
  });
});
