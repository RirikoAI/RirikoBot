import { DatabaseService } from '#database/database.service';
import { forwardRef, Inject } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

export class ConfigService {
  constructor(
    @Inject(forwardRef(() => DatabaseService))
    readonly db: DatabaseService,
    public configService: NestConfigService,
  ) {}

  async getAllDbConfig() {
    const applicationId = this.configService.get<string>(
      'discord.discordApplicationId',
    );
    let config = await this.db.configRepository.findOne({
      where: { applicationId: applicationId },
    });

    if (!config) {
      config = this.db.configRepository.create({
        applicationId: applicationId,
      });
      await this.db.configRepository.save(config);
    }

    return config;
  }
}
