import { Test, TestingModule } from '@nestjs/testing';
import { DiscordController } from './discord.controller';
import { DiscordService } from './discord.service';
import { CommandModule } from '#command/command.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

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
