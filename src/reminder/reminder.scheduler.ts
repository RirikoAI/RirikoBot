import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReminderService } from './reminder.service';

/**
 * Reminder scheduler
 * @description Scheduler for checking and sending reminders
 */
@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(private readonly reminderService: ReminderService) {}

  /**
   * Check for due reminders every minute
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkReminders() {
    // this.logger.debug('Checking for due reminders...');

    try {
      // Get all pending reminders that are due
      const pendingReminders = await this.reminderService.getPendingReminders();

      if (pendingReminders.length === 0) {
        return;
      }

      this.logger.log(`Found ${pendingReminders.length} due reminders to send`);

      // Send each reminder
      for (const reminder of pendingReminders) {
        try {
          const sent = await this.reminderService.sendReminder(reminder);
          if (sent) {
            this.logger.log(
              `Sent reminder ${reminder.id} to user ${reminder.userId}`,
            );
          } else {
            this.logger.warn(
              `Failed to send reminder ${reminder.id} to user ${reminder.userId}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error sending reminder ${reminder.id}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error checking reminders: ${error.message}`);
    }
  }
}
