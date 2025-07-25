import { ConfigService } from '@nestjs/config';
import { DiscordService } from '#discord/discord.service';
import { CommandService } from '#command/command.service';
import { Repository } from "typeorm";
import { Guild } from "#database/entities/guild.entity";
import { VoiceChannel } from "#database/entities/voice-channel.entity";

export type SharedServicesMock = typeof TestSharedService | any;

export const TestSharedService = {
  config: {} as ConfigService,
  discord: {} as DiscordService,
  commandService: {} as CommandService,
  autoVoiceChannelService: {} as any,
  db: {
    guildRepository: Repository<Guild>,
    voiceChannelRepository: Repository<VoiceChannel>,
  } as any,
  aiServiceFactory: {
    getService: jest.fn().mockReturnValue({
      chat: jest.fn().mockImplementation(function* () {
        yield { content: 'part 1', done: false };
        yield { content: 'part 2', done: false };
        yield { content: 'part 3', done: false };
        yield { content: 'part 4', done: true };
      }),
      pullModel: jest.fn().mockImplementation(function* () {
        yield { status: 'Downloading' };
        yield { status: 'Completed' };
      }),
      getAvailableModels: jest.fn().mockResolvedValue(['model1', 'model2']),
    }),
    getDefaultModel: jest.fn().mockReturnValue('default-model'),
    getServiceType: jest.fn().mockReturnValue('ollama'),
  },
};
