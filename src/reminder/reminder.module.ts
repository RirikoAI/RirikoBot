import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reminder } from '#database/entities/reminder.entity';
import { ReminderService } from './reminder.service';
import { ReminderScheduler } from './reminder.scheduler';
import { CommandModule } from '#command/command.module';
import { DiscordModule } from '#discord/discord.module';
import { DatabaseModule } from '#database/database.module';

/**
 * Reminder module
 * @description Module for handling reminders
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Reminder]),
    forwardRef(() => DiscordModule),
    DatabaseModule,
    forwardRef(() => CommandModule),
  ],
  providers: [ReminderService, ReminderScheduler],
  exports: [ReminderService],
})
export class ReminderModule {}
