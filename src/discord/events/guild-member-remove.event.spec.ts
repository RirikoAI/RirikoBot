import { GuildMemberRemoveEvent } from '#discord/events/guild-member-remove.event';
import { DiscordClient } from '#discord/discord.client';
import { CommandService } from '#command/command.service';
import { Events, GuildMember, GuildTextBasedChannel } from 'discord.js';
import { Logger } from '@nestjs/common';
import { WelcomeCard } from '#util/banner/welcome-card.util';

jest.mock('#util/banner/welcome-card.util');
jest.mock('@nestjs/common', () => ({
  Logger: {
    error: jest.fn(),
  },
}));

describe('GuildMemberRemoveEvent', () => {
  let client: DiscordClient;
  let commandService: CommandService;
  let member: GuildMember;

  beforeEach(() => {
    client = {
      on: jest.fn(),
    } as unknown as DiscordClient;

    commandService = {
      db: {
        guildRepository: {
          findOne: jest.fn(),
        },
      },
    } as unknown as CommandService;

    member = {
      guild: {
        id: 'guildId',
        channels: {
          cache: {
            get: jest.fn(),
          },
        },
      },
      displayName: 'testUser',
      displayAvatarURL: jest.fn().mockReturnValue('avatarURL'),
    } as unknown as GuildMember;
  });

  it('should be defined', () => {
    expect(GuildMemberRemoveEvent).toBeDefined();
  });

  it('should register an event handler for GuildMemberRemove', () => {
    GuildMemberRemoveEvent(client, commandService);
    expect(client.on).toHaveBeenCalledWith(
      Events.GuildMemberRemove,
      expect.any(Function),
    );
  });

  it('should send a farewell message when a member leaves', async () => {
    const guildConfig = {
      configurations: [
        { name: 'farewell_enabled', value: 'true' },
        { name: 'farewell_channel', value: 'channelId' },
        { name: 'farewell_bg', value: 'backgroundImgURL' },
      ],
    };

    commandService.db.guildRepository.findOne = jest
      .fn()
      .mockResolvedValue(guildConfig);

    const channel = {
      send: jest.fn(),
    } as unknown as GuildTextBasedChannel;

    member.guild.channels.cache.get = jest.fn().mockReturnValue(channel);

    const welcomeCard = new WelcomeCard();
    welcomeCard.generate = jest.fn().mockResolvedValue(Buffer.from(''));

    GuildMemberRemoveEvent(client, commandService);

    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(member);

    expect(commandService.db.guildRepository.findOne).toHaveBeenCalledWith({
      where: { id: member.guild.id },
    });
    expect(member.guild.channels.cache.get).toHaveBeenCalledWith('channelId');
    expect(welcomeCard.generate).toBeDefined();
    expect(channel.send).toHaveBeenCalled();
  });

  it('should log an error if something goes wrong', async () => {
    commandService.db.guildRepository.findOne = jest
      .fn()
      .mockRejectedValue(new Error('Test error'));

    GuildMemberRemoveEvent(client, commandService);

    const eventHandler = client.on.mock.calls[0][1];
    await eventHandler(member);

    expect(Logger.error).toHaveBeenCalledWith('Test error', expect.any(String));
  });
});
