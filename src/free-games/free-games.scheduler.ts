import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CommandService } from '#command/command.service';

/**
 * FreeGamesScheduler
 * @description Scheduler for free games alerts
 * @author AI Assistant
 */
@Injectable()
export class FreeGamesScheduler {
  private readonly logger = new Logger(FreeGamesScheduler.name);

  constructor(private readonly commandService: CommandService) {}

  /**
   * Check for free games and send alerts daily at 12:00 PM
   */
  @Cron(CronExpression.EVERY_DAY_AT_NOON)
  async checkFreeGames() {
    this.logger.log('Checking for free games...');

    try {
      // Get the FreeGamesCommand instance
      const freeGamesCommand: any = this.commandService.getCommand('freegames');

      if (!freeGamesCommand) {
        this.logger.error('FreeGamesCommand not found');
        return;
      }

      // Call the sendAlertToConfiguredChannel method
      await freeGamesCommand.sendAlertToConfiguredChannel();

      this.logger.log('Free games alerts sent successfully');
    } catch (error) {
      this.logger.error(`Error sending free games alerts: ${error.message}`);
    }
  }
}
