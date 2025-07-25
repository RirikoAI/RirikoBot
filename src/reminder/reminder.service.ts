import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Reminder } from '#database/entities/reminder.entity';
import { DiscordService } from '#discord/discord.service';

/**
 * Reminder service
 * @description Service for handling reminders
 */
@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    @InjectRepository(Reminder)
    private reminderRepository: Repository<Reminder>,
    private discordService: DiscordService,
  ) {}

  /**
   * Create a new reminder
   * @param userId The user ID
   * @param channelId The channel ID
   * @param guildId The guild ID
   * @param message The reminder message
   * @param scheduledTime The scheduled time
   * @param timezone Optional timezone
   * @returns The created reminder
   */
  async createReminder(
    userId: string,
    channelId: string,
    guildId: string,
    message: string,
    scheduledTime: Date,
    timezone?: string,
  ): Promise<Reminder> {
    const reminder = this.reminderRepository.create({
      userId,
      channelId,
      guildId,
      message,
      scheduledTime,
      timezone,
    });

    return this.reminderRepository.save(reminder);
  }

  /**
   * Get all pending reminders
   * @returns Array of pending reminders
   */
  async getPendingReminders(): Promise<Reminder[]> {
    return this.reminderRepository.find({
      where: {
        sent: false,
        scheduledTime: LessThanOrEqual(new Date()), // Get reminders that are due
      },
    });
  }

  /**
   * Get all reminders for a user
   * @param userId The user ID
   * @returns Array of reminders for the user
   */
  async getUserReminders(userId: string): Promise<Reminder[]> {
    return this.reminderRepository.find({
      where: {
        userId,
        sent: false,
      },
      order: {
        scheduledTime: 'ASC',
      },
    });
  }

  /**
   * Delete a reminder
   * @param id The reminder ID
   * @param userId The user ID (for verification)
   * @returns True if deleted, false otherwise
   */
  async deleteReminder(id: string, userId: string): Promise<boolean> {
    const result = await this.reminderRepository.delete({
      id,
      userId,
    });

    return result.affected > 0;
  }

  /**
   * Mark a reminder as sent
   * @param id The reminder ID
   * @returns True if updated, false otherwise
   */
  async markReminderAsSent(id: string): Promise<boolean> {
    const result = await this.reminderRepository.update(
      { id },
      { sent: true },
    );

    return result.affected > 0;
  }

  /**
   * Send a reminder to a user
   * @param reminder The reminder to send
   * @returns True if sent successfully, false otherwise
   */
  async sendReminder(reminder: Reminder): Promise<boolean> {
    try {
      const user = await this.discordService.client.users.fetch(reminder.userId);

      if (!user) {
        this.logger.warn(`User ${reminder.userId} not found`);
        return false;
      }

      // Try to send DM
      try {
        await user.send({
          content: `⏰ **Reminder:** ${reminder.message}`,
        });

        await this.markReminderAsSent(reminder.id);
        return true;
      } catch (error) {
        this.logger.warn(`Failed to send DM to user ${reminder.userId}: ${error.message}`);

        // Try to send to the original channel as fallback
        try {
          const channel = await this.discordService.client.channels.fetch(reminder.channelId);
          if (channel && channel.isTextBased()) {
            await (channel as any).send({
              content: `<@${reminder.userId}>, ⏰ **Reminder:** ${reminder.message}\n\n(I tried to DM you but couldn't)`,
            });

            await this.markReminderAsSent(reminder.id);
            return true;
          }
        } catch (channelError) {
          this.logger.error(`Failed to send reminder to channel ${reminder.channelId}: ${channelError.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error sending reminder ${reminder.id}: ${error.message}`);
    }

    return false;
  }
}
