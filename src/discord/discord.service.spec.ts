import { Test, TestingModule } from '@nestjs/testing';
import { DiscordController } from './discord.controller';
import { DiscordService } from './discord.service';
import { ConfigService } from '@nestjs/config';
import { CommandService } from '#command/command.service';
import { AvcService } from '#avc/avc.service';
import { DiscordClient } from '#discord/discord.client';
import { MessageCreateEvent } from './events/message-create.event';
import { ReadyEvent } from './events/ready.event';
import { InteractionCreateEvent } from '#discord/events/interaction-create.event';
import { VoiceStateUpdateEvent } from '#discord/events/voice-state-update.event';
import { MusicService } from '#music/music.service';
import { GiveawaysService } from '#giveaways/giveaways.service';
import { EconomyService } from '#economy/economy.service';

jest.mock('#discord/discord.client');
jest.mock('./events/message-create.event');
jest.mock('./events/ready.event');
jest.mock('#discord/events/interaction-create.event');
jest.mock('#discord/events/voice-state-update.event');

describe('Discord Service', () => {
  let service: DiscordService;
  let discordClientMock: jest.Mocked<DiscordClient>;

  const configServiceMock = { get: jest.fn() };
  const commandServiceMock = { get: jest.fn() };
  const avcServiceMock = { get: jest.fn() };
  const musicServiceMock = { createPlayer: jest.fn() };
  const giveawaysMock = { register: jest.fn() };
  const economyMock = { register: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: CommandService,
          useValue: commandServiceMock,
        },
        {
          provide: AvcService,
          useValue: avcServiceMock,
        },
        {
          provide: MusicService,
          useValue: musicServiceMock,
        },
        {
          provide: GiveawaysService,
          useValue: giveawaysMock,
        },
        {
          provide: EconomyService,
          useValue: economyMock,
        },
      ],
      controllers: [DiscordController],
    }).compile();

    service = module.get<DiscordService>(DiscordService);
    discordClientMock = new DiscordClient() as jest.Mocked<DiscordClient>;
    (DiscordClient as unknown as jest.Mock).mockReturnValue(discordClientMock);
  });

  it('service should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should connect to Discord and set ready state', async () => {
    const loginMock = jest.fn().mockResolvedValue('token');
    discordClientMock.login = loginMock;
    discordClientMock.on = jest.fn((event, callback) => {
      if (event === 'ready') {
        callback();
      }
    });

    await service.connect();

    expect(discordClientMock.login).toHaveBeenCalledWith(undefined);
    expect(service.ready).toBe(true);
  });

  it('should register events', () => {
    service.client = discordClientMock;

    service.registerEvents();

    expect(ReadyEvent).toHaveBeenCalledWith(
      discordClientMock,
      commandServiceMock,
    );
    expect(MessageCreateEvent).toHaveBeenCalledWith(
      discordClientMock,
      commandServiceMock,
      musicServiceMock,
      economyMock,
    );
    expect(InteractionCreateEvent).toHaveBeenCalledWith(
      discordClientMock,
      commandServiceMock,
    );
    expect(VoiceStateUpdateEvent).toHaveBeenCalledWith(
      discordClientMock,
      avcServiceMock,
    );
  });
});
