import { DatabaseService } from '#database/database.service';
import { forwardRef, Inject } from '@nestjs/common';

export class ConfigService {
  constructor(
    @Inject(forwardRef(() => DatabaseService))
    readonly db: DatabaseService,
  ) {}

  async getAllConfig() {
    let config = await this.db.configRepository.findOne({
      where: {
        applicationId: process.env.APPLICATION_ID,
      },
    });

    if (!config) {
      config = await this.db.configRepository.create({
        applicationId: process.env.DISCORD_APPLICATION_ID,
      });
      await this.db.configRepository.save(config);
    }

    return config;
  }
}
