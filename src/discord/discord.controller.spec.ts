import { Test, TestingModule } from '@nestjs/testing';
import { DiscordController } from './discord.controller';
import { DiscordService } from './discord.service';
import { ConfigModule } from '#config/config.module';
import { ConfigService } from '#config/config.service';
import {CommandModule} from "#command/command.module";

describe('Discord Controller', () => {
  let controller: DiscordController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule, CommandModule],
      providers: [DiscordService, ConfigService],
      exports: [DiscordService],
      controllers: [DiscordController],
    }).compile();
    
    controller = module.get<DiscordController>(DiscordController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});