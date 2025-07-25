import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ReminderScheduler } from './reminder.scheduler';
import { ReminderService } from './reminder.service';
import { Reminder } from '#database/entities/reminder.entity';

describe('ReminderScheduler', () => {
  let scheduler: ReminderScheduler;
  let reminderService: jest.Mocked<ReminderService>;
  let loggerSpy: jest.SpyInstance;

  const mockReminders: Reminder[] = [
    {
      id: '1',
      userId: 'user1',
      message: 'Test reminder 1',
      scheduledTime: new Date(),
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      userId: 'user2',
      message: 'Test reminder 2',
      scheduledTime: new Date(),
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ] as any;

  beforeEach(async () => {
    const reminderServiceMock = {
      getPendingReminders: jest.fn(),
      sendReminder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderScheduler,
        {
          provide: ReminderService,
          useValue: reminderServiceMock,
        },
      ],
    }).compile();

    scheduler = module.get<ReminderScheduler>(ReminderScheduler);
    reminderService = module.get(ReminderService);
    loggerSpy = jest.spyOn(Logger.prototype, 'log');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  describe('checkReminders', () => {
    it('should handle no pending reminders', async () => {
      reminderService.getPendingReminders.mockResolvedValue([]);
      await scheduler.checkReminders();
      expect(reminderService.getPendingReminders).toHaveBeenCalled();
      expect(reminderService.sendReminder).not.toHaveBeenCalled();
    });

    it('should process pending reminders successfully', async () => {
      reminderService.getPendingReminders.mockResolvedValue(mockReminders);
      reminderService.sendReminder.mockResolvedValue(true);

      await scheduler.checkReminders();

      expect(reminderService.getPendingReminders).toHaveBeenCalled();
      expect(reminderService.sendReminder).toHaveBeenCalledTimes(2);
      expect(loggerSpy).toHaveBeenCalledWith('Found 2 due reminders to send');
      expect(loggerSpy).toHaveBeenCalledWith('Sent reminder 1 to user user1');
    });

    it('should handle failed reminder sending', async () => {
      reminderService.getPendingReminders.mockResolvedValue([mockReminders[0]]);
      reminderService.sendReminder.mockResolvedValue(false);

      await scheduler.checkReminders();

      expect(reminderService.getPendingReminders).toHaveBeenCalled();
      expect(reminderService.sendReminder).toHaveBeenCalledTimes(1);
      expect(loggerSpy).toHaveBeenCalled();
    });

    it('should handle errors when sending individual reminders', async () => {
      const loggerErrorSpy = jest.spyOn(Logger.prototype, 'error');
      reminderService.getPendingReminders.mockResolvedValue([mockReminders[0]]);
      reminderService.sendReminder.mockRejectedValue(new Error('Send error'));

      await scheduler.checkReminders();

      expect(reminderService.getPendingReminders).toHaveBeenCalled();
      expect(reminderService.sendReminder).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Error sending reminder 1: Send error',
      );
    });

    it('should handle errors when getting pending reminders', async () => {
      const loggerErrorSpy = jest.spyOn(Logger.prototype, 'error');
      reminderService.getPendingReminders.mockRejectedValue(
        new Error('Fetch error'),
      );

      await scheduler.checkReminders();

      expect(reminderService.getPendingReminders).toHaveBeenCalled();
      expect(reminderService.sendReminder).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Error checking reminders: Fetch error',
      );
    });
  });
});
