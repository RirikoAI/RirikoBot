import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger('Ririko ModerationService');

  constructor() {
    this.logger.log('ModerationService initialized');
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {}
}
